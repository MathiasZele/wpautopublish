<?php
/**
 * Plugin Name: WP AutoPublish Helper
 * Description: Endpoint REST sécurisé pour réception d'articles générés par IA.
 * Version:     1.3.0
 */

defined('ABSPATH') || exit;

const WAP_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const WAP_MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

add_action('rest_api_init', function () {
    register_rest_route('wp-autopublish/v1', '/publish', [
        'methods'             => 'POST',
        'callback'            => 'wap_handle_publish',
        'permission_callback' => 'wap_authenticate_request',
    ]);
});

function wap_authenticate_request(WP_REST_Request $request): bool {
    $secret       = get_option('wap_secret_key', '');
    $headerSecret = $request->get_header('X-WP-AutoPublish-Secret');
    if (empty($secret) || empty($headerSecret)) return false;
    return hash_equals($secret, $headerSecret);
}

/**
 * Bloque les URLs internes/privées pour prévenir SSRF côté WordPress.
 */
function wap_is_safe_remote_url(string $url): bool {
    $parsed = parse_url($url);
    if (!$parsed || empty($parsed['scheme']) || empty($parsed['host'])) return false;
    if (!in_array(strtolower($parsed['scheme']), ['http', 'https'], true)) return false;

    $host = strtolower($parsed['host']);
    $blocked_hosts = ['localhost', 'metadata.google.internal', 'metadata', 'instance-data'];
    if (in_array($host, $blocked_hosts, true)) return false;

    // Si IP littérale, vérifier qu'elle est publique
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return (bool) filter_var(
            $host,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        );
    }

    // Résolution DNS
    $ips = @gethostbynamel($host);
    if (!$ips) return false;
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }
    }
    return true;
}

function wap_handle_publish(WP_REST_Request $request): WP_REST_Response {
    $params = $request->get_json_params();

    foreach (['title', 'content', 'status'] as $field) {
        if (empty($params[$field])) {
            return new WP_REST_Response(['error' => "Champ manquant : $field"], 400);
        }
    }

    // Statut bornés explicitement
    $allowed_status = ['publish', 'draft', 'pending'];
    $post_status = sanitize_text_field($params['status']);
    if (!in_array($post_status, $allowed_status, true)) {
        return new WP_REST_Response(['error' => 'Statut invalide'], 400);
    }

    // Auteur : configuré côté wp-admin, ignoré du payload (pas de spoof admin)
    $configured_author = (int) get_option('wap_default_author_id', 0);
    if ($configured_author <= 0) {
        return new WP_REST_Response([
            'error' => 'Configurer d\'abord l\'auteur des publications dans Réglages → WP AutoPublish'
        ], 500);
    }

    $post_data = [
        'post_title'   => sanitize_text_field($params['title']),
        'post_content' => wp_kses_post($params['content']),
        'post_status'  => $post_status,
        'post_author'  => $configured_author,
        'post_excerpt' => isset($params['excerpt']) ? sanitize_textarea_field($params['excerpt']) : '',
    ];

    if (!empty($params['categories']) && is_array($params['categories'])) {
        $post_data['post_category'] = array_map('intval', $params['categories']);
    }
    if (!empty($params['tags']) && is_array($params['tags'])) {
        $post_data['tags_input'] = array_map('sanitize_text_field', $params['tags']);
    }

    $post_id = wp_insert_post($post_data, true);
    if (is_wp_error($post_id)) {
        return new WP_REST_Response(['error' => $post_id->get_error_message()], 500);
    }

    // Image à la une
    if (!empty($params['featured_image_url'])) {
        $url = esc_url_raw($params['featured_image_url']);
        if (wap_is_safe_remote_url($url)) {
            $attachment_id = wap_sideload_image($url, $post_id, $params['title']);
            if (!is_wp_error($attachment_id)) {
                set_post_thumbnail($post_id, $attachment_id);
            }
        }
    }

    // Métadonnées Yoast SEO (clés avec underscore)
    $yoast_fields = [
        '_yoast_wpseo_title'    => $params['yoast_title']    ?? '',
        '_yoast_wpseo_metadesc' => $params['yoast_metadesc'] ?? '',
        '_yoast_wpseo_focuskw'  => $params['yoast_focuskw']  ?? '',
    ];
    foreach ($yoast_fields as $key => $value) {
        if (!empty($value)) update_post_meta($post_id, $key, sanitize_text_field($value));
    }

    return new WP_REST_Response([
        'success' => true,
        'post_id' => $post_id,
        'url'     => get_permalink($post_id),
    ], 201);
}

function wap_sideload_image(string $url, int $post_id, string $alt) {
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';

    // Limite de taille à 10 MB (filtre on_request_args)
    $size_filter = function ($args) {
        $args['limit_response_size'] = WAP_MAX_DOWNLOAD_BYTES;
        return $args;
    };
    add_filter('http_request_args', $size_filter);
    $tmp = download_url($url, 30);
    remove_filter('http_request_args', $size_filter);

    if (is_wp_error($tmp)) return $tmp;

    // Vérification MIME
    $mime = wp_check_filetype($tmp);
    if (empty($mime['type']) || !in_array($mime['type'], WAP_ALLOWED_MIME_TYPES, true)) {
        @unlink($tmp);
        return new WP_Error('wap_bad_mime', 'Type de fichier non autorisé');
    }

    // Vérification additionnelle : getimagesize() doit reconnaître l'image
    if (!@getimagesize($tmp)) {
        @unlink($tmp);
        return new WP_Error('wap_bad_image', 'Fichier non reconnu comme image');
    }

    $name = sanitize_file_name(basename(parse_url($url, PHP_URL_PATH) ?: ('img-' . $post_id)));
    if (!preg_match('/\.(jpe?g|png|webp|gif)$/i', $name)) {
        $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
        $name = 'img-' . $post_id . '.' . ($ext[$mime['type']] ?? 'jpg');
    }

    $file_array = ['name' => $name, 'tmp_name' => $tmp];

    $attachment_id = media_handle_sideload($file_array, $post_id, $alt);
    if (is_wp_error($attachment_id)) @unlink($tmp);
    return $attachment_id;
}

// ─── Page de configuration wp-admin ──────────────────────────────────────────
add_action('admin_menu', function () {
    add_options_page('WP AutoPublish', 'WP AutoPublish', 'manage_options', 'wp-autopublish', 'wap_settings_page');
});
add_action('admin_init', function () {
    register_setting('wap_settings', 'wap_secret_key', ['sanitize_callback' => 'sanitize_text_field']);
    register_setting('wap_settings', 'wap_default_author_id', [
        'sanitize_callback' => 'absint',
    ]);
});

function wap_settings_page(): void {
    $users = get_users(['fields' => ['ID', 'display_name', 'user_login']]);
    $current_author = (int) get_option('wap_default_author_id', 0); ?>
    <div class="wrap">
        <h1>WP AutoPublish Helper — Configuration</h1>
        <form method="post" action="options.php">
            <?php settings_fields('wap_settings'); ?>
            <table class="form-table">
                <tr>
                    <th>Clé secrète</th>
                    <td>
                        <input type="text" name="wap_secret_key"
                               value="<?php echo esc_attr(get_option('wap_secret_key')); ?>"
                               class="regular-text" />
                        <p class="description">
                            Endpoint : <code><?php echo esc_url(rest_url('wp-autopublish/v1/publish')); ?></code>
                        </p>
                    </td>
                </tr>
                <tr>
                    <th>Auteur des publications</th>
                    <td>
                        <select name="wap_default_author_id">
                            <option value="0">— Sélectionner —</option>
                            <?php foreach ($users as $u): ?>
                                <option value="<?php echo (int) $u->ID; ?>"
                                    <?php selected($current_author, (int) $u->ID); ?>>
                                    <?php echo esc_html($u->display_name . ' (' . $u->user_login . ')'); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                        <p class="description">
                            Tous les articles reçus via WP AutoPublish seront publiés sous ce compte.
                            Recommandation : créer un utilisateur dédié avec rôle <em>Auteur</em>.
                        </p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
<?php }
