<?php
/**
 * Plugin Name: WP AutoPublish Helper
 * Description: Endpoint REST sécurisé pour réception d'articles générés par IA.
 * Version:     1.4.0
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
 * Bloque les URLs internes/privées (IPv4 + IPv6) pour prévenir SSRF côté WordPress.
 */
function wap_is_safe_remote_url(string $url): bool {
    $parsed = parse_url($url);
    if (!$parsed || empty($parsed['scheme']) || empty($parsed['host'])) return false;
    if (!in_array(strtolower($parsed['scheme']), ['http', 'https'], true)) return false;

    $host = strtolower($parsed['host']);
    $blocked_hosts = ['localhost', 'metadata.google.internal', 'metadata', 'instance-data'];
    if (in_array($host, $blocked_hosts, true)) return false;

    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return (bool) filter_var(
            $host,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        );
    }

    // Résolution exhaustive : A (IPv4) ET AAAA (IPv6)
    $ips = [];
    $records = @dns_get_record($host, DNS_A | DNS_AAAA);
    if ($records) {
        foreach ($records as $r) {
            if (!empty($r['ip']))    $ips[] = $r['ip'];
            if (!empty($r['ipv6']))  $ips[] = $r['ipv6'];
        }
    }
    if (empty($ips)) {
        $fallback = @gethostbynamel($host);
        if ($fallback) $ips = $fallback;
    }
    if (empty($ips)) return false;

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

    $allowed_status = ['publish', 'draft', 'pending'];
    $post_status = sanitize_text_field($params['status']);
    if (!in_array($post_status, $allowed_status, true)) {
        return new WP_REST_Response(['error' => 'Statut invalide'], 400);
    }

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

    // Tags : seulement termes EXISTANTS (anti-spam DB)
    if (!empty($params['tags']) && is_array($params['tags'])) {
        $existing_ids = [];
        foreach ($params['tags'] as $t) {
            if (is_int($t) || ctype_digit((string) $t)) {
                $term = term_exists((int) $t, 'post_tag');
            } else {
                $term = term_exists(sanitize_text_field((string) $t), 'post_tag');
            }
            if ($term && !is_wp_error($term)) {
                $existing_ids[] = (int) (is_array($term) ? $term['term_id'] : $term);
            }
        }
        if (!empty($existing_ids)) {
            $post_data['tax_input'] = ['post_tag' => $existing_ids];
        }
    }

    $post_id = wp_insert_post($post_data, true);
    if (is_wp_error($post_id)) {
        error_log('[wp-autopublish] insert failed: ' . $post_id->get_error_message());
        return new WP_REST_Response(['error' => 'Création de l\'article impossible'], 500);
    }

    if (!empty($params['featured_image_url'])) {
        $url = esc_url_raw($params['featured_image_url']);
        if (!empty($url) && wap_is_safe_remote_url($url)) {
            $attachment_id = wap_sideload_image($url, $post_id, $params['title']);
            if (!is_wp_error($attachment_id)) {
                set_post_thumbnail($post_id, $attachment_id);
            } else {
                error_log('[wp-autopublish] sideload failed: ' . $attachment_id->get_error_message());
            }
        }
    }

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

    $hardening_filter = function ($args) {
        $args['limit_response_size'] = WAP_MAX_DOWNLOAD_BYTES;
        $args['redirection']         = 0; // Pas de suivi de redirect (anti DNS rebinding via 302)
        $args['timeout']             = 30;
        return $args;
    };
    add_filter('http_request_args', $hardening_filter);
    $tmp = download_url($url, 30);
    remove_filter('http_request_args', $hardening_filter);

    if (is_wp_error($tmp)) return $tmp;

    // Triple validation MIME (extension + magic bytes + cohérence)
    $by_extension = wp_check_filetype($tmp);
    if (empty($by_extension['type']) || !in_array($by_extension['type'], WAP_ALLOWED_MIME_TYPES, true)) {
        @unlink($tmp);
        return new WP_Error('wap_bad_ext', 'Extension non autorisée');
    }

    $info = @getimagesize($tmp);
    if ($info === false || empty($info['mime']) || !in_array($info['mime'], WAP_ALLOWED_MIME_TYPES, true)) {
        @unlink($tmp);
        return new WP_Error('wap_bad_image', 'Fichier non reconnu comme image valide');
    }

    if ($by_extension['type'] !== $info['mime']) {
        @unlink($tmp);
        return new WP_Error('wap_mime_mismatch', 'Incohérence type de fichier — possible polyglot');
    }

    if (($info[0] ?? 0) > 10000 || ($info[1] ?? 0) > 10000) {
        @unlink($tmp);
        return new WP_Error('wap_image_too_large', 'Image trop grande (>10000px)');
    }

    // Nom de fichier propre, jamais dérivé directement de l'URL
    $ext_map = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    $name = 'img-' . $post_id . '-' . wp_generate_password(8, false) . '.' . ($ext_map[$info['mime']] ?? 'jpg');

    $file_array = ['name' => sanitize_file_name($name), 'tmp_name' => $tmp];

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
    register_setting('wap_settings', 'wap_default_author_id', ['sanitize_callback' => 'absint']);
});

function wap_settings_page(): void {
    if (!current_user_can('manage_options')) {
        wp_die('Accès refusé');
    }
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
                               class="regular-text" autocomplete="off" spellcheck="false" />
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
