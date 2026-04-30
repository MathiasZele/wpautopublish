const fs = require('fs');
const path = 'c:/Users/Mathias Zele/Documents/projet/wp-autopublish/lib/articles 2.md';
const target = 'c:/Users/Mathias Zele/Documents/projet/wp-autopublish/lib/articles2.php';

const mdContent = fs.readFileSync(path, 'utf8');

const phpScript = `<?php
/**
 * Script de publication automatique en masse (Articles 2)
 * Ce script est à coller dans Code Snippets.
 * Il créera tous les articles en brouillon (Draft) avec une catégorisation dynamique.
 */

function am_get_categories_for_article2($title, $content) {
    $title_lower = mb_strtolower($title, 'UTF-8');
    $content_lower = mb_strtolower($content, 'UTF-8');
    
    $cats = array();
    
    // Tchad-Algérie (Économie, Politique, Afrique)
    if (strpos($title_lower, 'tchad') !== false || strpos($title_lower, 'algérie') !== false) {
        $cats[] = 550; // Afrique
        $cats[] = 554; // Économie
        $cats[] = 548; // Politique
    } 
    // US-China-Taiwan tensions (International, Politique, Sécurité)
    elseif (strpos($title_lower, 'états-unis') !== false || strpos($title_lower, 'united states') !== false || strpos($title_lower, 'estados unidos') !== false || strpos($title_lower, 'china') !== false || strpos($title_lower, 'chinoise') !== false || strpos($title_lower, 'pequim') !== false) {
        $cats[] = 552; // International
        $cats[] = 548; // Politique
        $cats[] = 577; // Sécurité
    }
    // Taiwan-Africa cooperation (International, Afrique)
    elseif (strpos($title_lower, 'taiwan') !== false || strpos($title_lower, 'taïwan') !== false || strpos($title_lower, 'taiwán') !== false) {
        $cats[] = 552; // International
        $cats[] = 550; // Afrique
    } else {
        // Par défaut
        $cats[] = 548; // Politique
        $cats[] = 550; // Afrique
    }
    
    return array_unique($cats);
}

function am_import_articles_2_from_md() {
    // Sécurité : n'exécuter que si ?import_brouillons_2=1 est dans l'URL
    if ( !isset($_GET['import_brouillons_2']) || $_GET['import_brouillons_2'] !== '1' ) {
        return;
    }

    $raw_text = <<<'EOD'
${mdContent.replace(/\\/g, '\\\\')}
EOD;

    // Séparateur : ligne avec des underscores (au moins 10)
    $articles_raw = preg_split('/_{10,}/', $raw_text);
    $count = 0;

    foreach ($articles_raw as $raw) {
        $raw = trim($raw);
        if (empty($raw)) continue;

        // Remplacer les retours charriot Windows s'ils existent
        $raw = str_replace("\\r\\n", "\\n", $raw);
        $lines = explode("\\n", $raw);
        $title = '';
        $content_lines = array();

        foreach ($lines as $line) {
            $trimmed = trim($line);
            
            if (empty($trimmed) && empty($title)) {
                continue;
            }

            if (empty($title)) {
                $title = $trimmed;
                continue;
            }

            if (empty($trimmed)) {
                $content_lines[] = ""; 
                continue;
            }

            // Transformation de *texte* en <strong>texte</strong>
            $formatted = preg_replace('/\\*(.*?)\\*/', '<strong>$1</strong>', $trimmed);
            $content_lines[] = "<p>" . $formatted . "</p>";
        }

        // Nettoyage du titre
        $clean_title = str_replace('*', '', $title);
        $clean_title = trim($clean_title);
        $content = implode("\\n", $content_lines);
        
        // Catégorisation dynamique
        $categories = am_get_categories_for_article2($clean_title, $content);

        // Insertion
        $article_data = array(
            'post_title'    => $clean_title,
            'post_content'  => $content,
            'post_status'   => 'draft',
            'post_author'   => get_current_user_id() ? get_current_user_id() : 1,
            'post_category' => $categories
        );

        $post_id = wp_insert_post($article_data);

        if (!is_wp_error($post_id)) {
            // SEO Yoast
            update_post_meta($post_id, '_yoast_wpseo_title', $clean_title . " | Afrique Média");
            
            $desc = wp_strip_all_tags($content);
            $desc = mb_substr($desc, 0, 150) . '...';
            update_post_meta($post_id, '_yoast_wpseo_metadesc', $desc);

            update_post_meta($post_id, '_yoast_wpseo_focuskw', mb_substr($clean_title, 0, 80));

            $count++;
        }
    }

    wp_die("<h1>✅ Opération réussie !</h1><p><strong>" . $count . " articles</strong> ont été créés et catégorisés avec succès en brouillon.</p><p><a href='/wp-admin/edit.php'>Aller voir les brouillons dans l\\'administration</a></p>");
}

add_action('init', 'am_import_articles_2_from_md');
`;

fs.writeFileSync(target, phpScript, 'utf8');
console.log('Script PHP articles2 généré avec succès.');
