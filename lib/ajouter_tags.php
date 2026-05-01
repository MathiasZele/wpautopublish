<?php
/**
 * Script d'ajout d'étiquettes (tags) aux articles en brouillon existants.
 * Ce script est à coller dans Code Snippets.
 */

function am_add_tags_to_existing_drafts() {
    // Sécurité : n'exécuter que si ?ajouter_tags=1 est dans l'URL
    if ( !isset($_GET['ajouter_tags']) || $_GET['ajouter_tags'] !== '1' ) {
        return;
    }

    // Sécurité CRITIQUE : vérifier que l'utilisateur est un administrateur connecté
    if ( !current_user_can('manage_options') ) {
        wp_die("Accès refusé : vous devez être administrateur pour exécuter ce script.", "Erreur de sécurité", array('response' => 403));
    }

    // Récupérer tous les articles en statut 'brouillon'
    $args = array(
        'post_type'      => 'post',
        'post_status'    => 'draft',
        'posts_per_page' => -1 
    );

    $drafts = get_posts($args);
    $count = 0;

    foreach ($drafts as $post) {
        $title = mb_strtolower($post->post_title, 'UTF-8');
        $content = mb_strtolower($post->post_content, 'UTF-8');
        $tags = array();

        // --- Logique Groupe 1 : Mali ---
        if (strpos($title, 'mali') !== false || strpos($title, 'malí') !== false || strpos($title, 'kati') !== false || strpos($title, 'goïta') !== false || strpos($title, 'terrorist') !== false) {
            $tags[] = 'Mali';
            if (strpos($title, 'terrorist') !== false || strpos($content, 'terrorist') !== false || strpos($title, 'terroriste') !== false) {
                $tags[] = 'Terrorisme';
                $tags[] = 'Sécurité';
            }
            if (strpos($title, 'goïta') !== false || strpos($content, 'goïta') !== false) {
                $tags[] = 'Assimi Goïta';
            }
            if (strpos($title, 'maïga') !== false) {
                $tags[] = 'Abdoulaye Maïga';
            }
            if (strpos($title, 'russie') !== false || strpos($content, 'russie') !== false || strpos($title, 'moscow') !== false || strpos($title, 'moscú') !== false || strpos($title, 'moscou') !== false) {
                $tags[] = 'Russie';
                $tags[] = 'Coopération militaire';
            }
        }

        // --- Logique Groupe 2 : Taïwan / Tensions US-Chine ---
        if (strpos($title, 'taiwan') !== false || strpos($title, 'taïwan') !== false || strpos($title, 'taiwán') !== false) {
            $tags[] = 'Taïwan';
            
            if (strpos($title, 'afric') !== false || strpos($title, 'áfrica') !== false) {
                $tags[] = 'Afrique';
                $tags[] = 'Diplomatie';
            }
            if (strpos($title, 'états-unis') !== false || strpos($title, 'united states') !== false || strpos($title, 'estados unidos') !== false || strpos($title, 'china') !== false || strpos($title, 'chine') !== false || strpos($content, 'chine') !== false) {
                $tags[] = 'Chine';
                $tags[] = 'États-Unis';
                $tags[] = 'Tensions';
                $tags[] = 'Indo-Pacifique';
            }
        }

        // --- Logique Groupe 3 : Tchad-Algérie ---
        if (strpos($title, 'tchad') !== false || strpos($title, 'algérie') !== false) {
            $tags[] = 'Tchad';
            $tags[] = 'Algérie';
            $tags[] = 'Économie';
            $tags[] = 'Partenariat';
            $tags[] = 'Développement';
        }

        // Ajout des tags si on en a trouvé
        if (!empty($tags)) {
            // true = ajouter aux tags existants (ne pas écraser s'il y en a déjà)
            wp_set_post_tags($post->ID, array_unique($tags), true);
            $count++;
        }
    }

    wp_die("<h1>✅ Opération réussie !</h1><p>Les étiquettes ont été analysées sur <strong>" . count($drafts) . " brouillons</strong>. <br><strong>" . $count . " articles</strong> ont reçu de nouveaux tags pertinents.</p><p><a href='/wp-admin/edit.php'>Aller voir les brouillons dans l\\'administration</a></p>");
}

add_action('init', 'am_add_tags_to_existing_drafts');
