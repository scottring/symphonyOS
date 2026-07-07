use tauri::menu::{AboutMetadata, CheckMenuItemBuilder, Menu, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager};

const NAV_EVENTS: [(&str, &str); 4] = [
    ("nav-today", "today"),
    ("nav-inbox", "inbox"),
    ("nav-projects", "projects"),
    ("nav-routines", "routines"),
];

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let launch_login = CheckMenuItemBuilder::with_id("launch-login", "Launch at Login")
        .checked(false)
        .build(app)?;

    let app_menu = SubmenuBuilder::new(app, "Symphony")
        .about(Some(AboutMetadata::default()))
        .separator()
        .item(&launch_login)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id("new-capture", "New Task…")
                .accelerator("Cmd+N")
                .build(app)?,
        )
        .separator()
        .close_window()
        .build()?;

    // A real Edit menu is what makes Cmd+C/V/X/A work inside the webview.
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let mut view_menu = SubmenuBuilder::new(app, "View");
    for (i, (id, label)) in [
        ("nav-today", "Today"),
        ("nav-inbox", "Inbox"),
        ("nav-projects", "Projects"),
        ("nav-routines", "Routines"),
    ]
    .iter()
    .enumerate()
    {
        view_menu = view_menu.item(
            &MenuItemBuilder::with_id(*id, *label)
                .accelerator(format!("Cmd+{}", i + 1))
                .build(app)?,
        );
    }
    let view_menu = view_menu.build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .separator()
        .fullscreen()
        .build()?;

    Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu],
    )
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    if id == "new-capture" {
        show_main(app);
        let _ = app.emit_to("main", "shell:quick-capture", ());
        return;
    }
    for (menu_id, view) in NAV_EVENTS {
        if id == menu_id {
            show_main(app);
            let _ = app.emit_to("main", "shell:navigate", view);
            return;
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .run(tauri::generate_context!())
        .expect("error while running Symphony");
}
