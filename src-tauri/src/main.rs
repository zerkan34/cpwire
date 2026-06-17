// Empêche l'ouverture d'une console noire derrière l'app en release (Windows).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Erreur au lancement de cp|WIRE");
}
