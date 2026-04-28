<?php
/**
 * Plugin Name: WP AutoPublish Helper
 * Description: Endpoint REST sécurisé pour réception d'articles générés par IA.
 * Version:     1.2.0
 */

defined('ABSPATH') || exit;

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

function wap_handle_publish(WP_REST_Request $request): WP_REST_Response {
    $params = $request->get_json_params();

    foreach (['title', 'content', 'status'] as $field) {
        if (empty($params[$field])) {
            return new WP_REST_Response(['error' => "Champ manquant : $field"], 400);
        }
    }

    $post_data = [
        'post_title'   => sanitize_text_field($params['title']),
        'post_content' => wp_kses_post($params['content']),
        'post_status'  => sanitize_text_field($params['status']),
        'post_author'  => isset($params['author_id']) ? intval($params['author_id']) : 1,
        'post_excerpt' => isset($params['excerpt']) ? sanitize_textarea_field($params['excerpt']) : '',
    ];

    if (!empty($params['categories'])) {
        $post_data['post_category'] = array_map('intval', $params['categories']);
    }
    if (!empty($params['tags'])) {
        $post_data['tags_input'] = array_map('sanitize_text_field', $params['tags']);
    }

    $post_id = wp_insert_post($post_data, true);
    if (is_wp_error($post_id)) {
        return new WP_REST_Response(['error' => $post_id->get_error_message()], 500);
    }

    // Image à la une
    if (!empty($params['featured_image_url'])) {
        $attachment_id = wap_sideload_image($params['featured_image_url'], $post_id, $params['title']);
        if (!is_wp_error($attachment_id)) {
            set_post_thumbnail($post_id, $attachment_id);
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

    $tmp = download_url($url);
    if (is_wp_error($tmp)) return $tmp;

    $file_array = [
        'name'     => basename(parse_url($url, PHP_URL_PATH)),
        'tmp_name' => $tmp,
    ];

    $attachment_id = media_handle_sideload($file_array, $post_id, $alt);
    if (is_wp_error($attachment_id)) @unlink($tmp);
    return $attachment_id;
}

// Page de configuration wp-admin
add_action('admin_menu', function () {
    add_options_page('WP AutoPublish', 'WP AutoPublish', 'manage_options', 'wp-autopublish', 'wap_settings_page');
});
add_action('admin_init', function () {
    register_setting('wap_settings', 'wap_secret_key', ['sanitize_callback' => 'sanitize_text_field']);
});

function wap_settings_page(): void { ?>
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
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
<?php }
