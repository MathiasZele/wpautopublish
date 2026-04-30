const fs = require('fs');
const path = 'c:/Users/Mathias Zele/Documents/projet/wp-autopublish/lib/article.ini';
const target = 'c:/Users/Mathias Zele/Documents/projet/wp-autopublish/lib/articles1.php';

const iniContent = fs.readFileSync(path, 'utf8');

const phpScript = `<?php
/**
 * Script de publication automatique en masse
 * Ce script est à coller dans Code Snippets.
 * Il créera tous les articles en brouillon (Draft).
 */

function am_import_all_articles_from_ini() {
    // Sécurité : n'exécuter que si ?import_brouillons=1 est dans l'URL
    if ( !isset($_GET['import_brouillons']) || $_GET['import_brouillons'] !== '1' ) {
        return;
    }

    // On utilise la syntaxe Nowdoc de PHP pour éviter tout problème d'échappement (pas besoin d'échapper les guillemets ou variables)
    $raw_text = <<<'EOD'
${iniContent.replace(/\\/g, '\\\\')}
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
            
            // Ignorer les lignes vides au début
            if (empty($trimmed) && empty($title)) {
                continue;
            }

            if (empty($title)) {
                $title = $trimmed;
                continue;
            }

            if (empty($trimmed)) {
                $content_lines[] = ""; // Ligne vide pour aérer le HTML
                continue;
            }

            // Transformation de *texte* en <strong>texte</strong>
            // Le motif regex capture tout ce qui est entre astérisques
            $formatted = preg_replace('/\\*(.*?)\\*/', '<strong>$1</strong>', $trimmed);
            $content_lines[] = "<p>" . $formatted . "</p>";
        }

        // Le titre doit être propre pour le champ WordPress
        $clean_title = str_replace('*', '', $title);
        $content = implode("\\n", $content_lines);

        // Insertion
        $article_data = array(
            'post_title'    => $clean_title,
            'post_content'  => $content,
            'post_status'   => 'draft',
            'post_author'   => get_current_user_id() ? get_current_user_id() : 1,
            'post_category' => array(548, 550) // Politique / Afrique par défaut
        );

        $post_id = wp_insert_post($article_data);

        if (!is_wp_error($post_id)) {
            // SEO Yoast
            update_post_meta($post_id, '_yoast_wpseo_title', $clean_title . " | Afrique Média");
            
            // Meta-description auto générée (150 caractères)
            $desc = wp_strip_all_tags($content);
            $desc = mb_substr($desc, 0, 150) . '...';
            update_post_meta($post_id, '_yoast_wpseo_metadesc', $desc);

            update_post_meta($post_id, '_yoast_wpseo_focuskw', mb_substr($clean_title, 0, 80));

            $count++;
        }
    }

    wp_die("<h1>✅ Opération réussie !</h1><p><strong>" . $count . " articles</strong> ont été créés avec succès et mis en brouillon.</p><p><a href='/wp-admin/edit.php'>Aller voir les brouillons dans l\\'administration</a></p>");
}

add_action('init', 'am_import_all_articles_from_ini');
`;

fs.writeFileSync(target, phpScript, 'utf8');
console.log('Script PHP généré avec succès.');
