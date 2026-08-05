use serde::Deserialize;
use tauri::menu::{
    AboutMetadata, CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder,
};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::ShortcutState;

const APP_URL: &str = "https://app.symphony-os.com";

// Schemes macOS owns and WKWebView silently drops. Kept in sync with the
// SYSTEM_SCHEMES list inside EXTERNAL_LINKS_JS below.
const SYSTEM_SCHEMES: [&str; 4] = ["tel", "mailto", "sms", "facetime"];

/// Hand a URL to macOS. The allowlist is the security boundary: the page can
/// ask for these and nothing else (no file://, no arbitrary app schemes).
fn open_externally(url: &str) {
    let allowed = ["https://", "http://", "tel:", "mailto:", "sms:", "facetime:"];
    if allowed.iter().any(|p| url.starts_with(p)) {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
}

/// Catch `tel:`/`sms:`/`mailto:`/`facetime:` **navigations** and hand them to
/// macOS.
///
/// EXTERNAL_LINKS_JS already intercepts anchor *clicks*, but a click is only
/// one of the ways the app reaches a phone: it also does
/// `window.location.href = 'tel:…'` (ContactCard, DetailPanelRedesign) and
/// `window.open('tel:…', '_self')` (TodayView, DailyBriefing,
/// ProactiveSuggestionChips). Neither is a click, so neither was intercepted —
/// WKWebView accepted the navigation and then did nothing with it, and every
/// call/text/email action in those surfaces was dead in the Mac app while
/// working in any browser.
///
/// A navigation policy hook is the one place ALL of them converge — anchors,
/// `location.href`, `window.open(…, '_self')`, form submits, and anything added
/// later. Returning false cancels the doomed navigation.
fn system_scheme_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("symphony-system-schemes")
        .on_navigation(|_webview, url| {
            if SYSTEM_SCHEMES.contains(&url.scheme()) {
                open_externally(url.as_str());
                return false;
            }
            true
        })
        .build()
}

// WKWebView silently drops target="_blank" clicks and window.open() calls —
// there is no popup handler in this shell, so external links did nothing.
// This script (injected on every page load) forwards external http(s) URLs to
// Rust over the event bridge the page is already permitted to use
// (capabilities/remote.json → core:event:default); Rust hands them to the
// system browser via `open`.
//
// Division of labour with system_scheme_plugin above: that hook owns every
// tel:/sms:/mailto: *navigation*, which is the durable catch-all. This script
// owns the two things a navigation hook cannot see — popup requests
// (`window.open`, including `target="_blank"`) and http(s) links that should
// leave the app rather than replace it.
const EXTERNAL_LINKS_JS: &str = r#"
(function () {
  if (window.__symphonyExternalLinks) return;
  window.__symphonyExternalLinks = true;
  var external = function (raw) {
    try {
      var u = new URL(raw, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.origin === location.origin ? null : u.href;
    } catch (e) { return null; }
  };
  var send = function (url) {
    if (window.__TAURI__ && window.__TAURI__.event) {
      window.__TAURI__.event.emit('shell:open-external', url);
    }
  };
  var SYSTEM_SCHEMES = ['tel:', 'mailto:', 'sms:', 'facetime:'];
  var systemScheme = function (raw) {
    var s = String(raw || '').toLowerCase();
    return SYSTEM_SCHEMES.some(function (p) { return s.indexOf(p) === 0; });
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.href || '';
    if (systemScheme(href)) {
      // WKWebView ignores tel:/mailto:/… navigations — hand them to macOS.
      e.preventDefault();
      e.stopPropagation();
      send(href);
      return;
    }
    var url = external(href);
    if (url && (a.target === '_blank' || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      send(url);
    }
  }, true);
  var originalOpen = window.open ? window.open.bind(window) : null;
  window.open = function (raw) {
    // window.open('mailto:…', '_blank') asks for a popup, and a popup request
    // is NOT a navigation — the Rust navigation hook never sees it. Catch it
    // here. ('_self' variants do navigate, so they are caught either way.)
    if (raw && systemScheme(raw)) { send(String(raw)); return null; }
    var url = raw ? external(String(raw)) : null;
    if (url) { send(url); return null; }
    return originalOpen ? originalOpen.apply(null, arguments) : null;
  };
})();
"#;

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

fn create_capture_window(app: &AppHandle) -> tauri::Result<()> {
    let url: tauri::Url = format!("{APP_URL}/capture").parse().expect("valid capture url");
    WebviewWindowBuilder::new(app, "capture", WebviewUrl::External(url))
        .title("Quick Capture")
        .inner_size(560.0, 120.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .visible(false)
        .center()
        .build()?;
    Ok(())
}

fn toggle_capture(app: &AppHandle) {
    let Some(win) = app.get_webview_window("capture") else {
        return;
    };
    if win.is_visible().unwrap_or(false) {
        let _ = win.hide();
    } else {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit_to("capture", "capture:shown", ());
    }
}

// Shape emitted by the web bridge (src/desktop/trayPayload.ts) — keep in sync.
#[derive(Deserialize)]
struct TrayItem {
    #[allow(dead_code)]
    id: String,
    title: String,
}

#[derive(Deserialize)]
struct TrayPayload {
    remaining: u32,
    items: Vec<TrayItem>,
}

fn tray_menu(app: &AppHandle, payload: &TrayPayload) -> tauri::Result<Menu<tauri::Wry>> {
    let mut builder = MenuBuilder::new(app);
    let header_text = if payload.remaining == 0 {
        "Today — all done".to_string()
    } else {
        format!("Today — {} remaining", payload.remaining)
    };
    builder = builder
        .item(
            &MenuItemBuilder::with_id("tray-header", header_text)
                .enabled(false)
                .build(app)?,
        )
        .separator();
    for (i, item) in payload.items.iter().enumerate() {
        let mut title = item.title.clone();
        if title.chars().count() > 40 {
            title = format!("{}…", title.chars().take(39).collect::<String>());
        }
        builder = builder.item(&MenuItemBuilder::with_id(format!("tray-task-{i}"), title).build(app)?);
    }
    builder
        .separator()
        .item(&MenuItemBuilder::with_id("tray-open", "Open Symphony").build(app)?)
        .item(
            &MenuItemBuilder::with_id("tray-capture", "Quick Capture")
                .accelerator("Cmd+Shift+Space")
                .build(app)?,
        )
        .separator()
        .quit()
        .build()
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let initial = TrayPayload { remaining: 0, items: vec![] };
    let menu = tray_menu(app, &initial)?;
    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().expect("app icon").clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .build(app)?;
    Ok(())
}

fn update_tray(app: &AppHandle, payload: &TrayPayload) {
    let Some(tray) = app.tray_by_id("main-tray") else {
        return;
    };
    if let Ok(menu) = tray_menu(app, payload) {
        let _ = tray.set_menu(Some(menu));
    }
    let title = if payload.remaining > 0 {
        Some(payload.remaining.to_string())
    } else {
        None
    };
    let _ = tray.set_title(title);
}

fn build_menu(app: &AppHandle, autostart_enabled: bool) -> tauri::Result<Menu<tauri::Wry>> {
    let launch_login = CheckMenuItemBuilder::with_id("launch-login", "Launch at Login")
        .checked(autostart_enabled)
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
    if id == "tray-open" || id.starts_with("tray-task-") {
        show_main(app);
        let _ = app.emit_to("main", "shell:navigate", "today");
        return;
    }
    if id == "tray-capture" {
        toggle_capture(app);
        return;
    }
    if id == "launch-login" {
        // The CheckMenuItem toggles its own checkmark; flip the real state to match.
        let autolaunch = app.autolaunch();
        let enabled = autolaunch.is_enabled().unwrap_or(false);
        let result = if enabled {
            autolaunch.disable()
        } else {
            autolaunch.enable()
        };
        if result.is_err() {
            eprintln!("failed to toggle launch at login");
        }
        return;
    }
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
        .plugin(system_scheme_plugin())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["cmd+shift+space"])
                .expect("valid shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_capture(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
            let menu = build_menu(app.handle(), autostart_enabled)?;
            app.set_menu(menu)?;
            create_capture_window(app.handle())?;
            build_tray(app.handle())?;
            // Today's remaining tasks stream in from the web bridge.
            let tray_handle = app.handle().clone();
            app.listen_any("shell:tray-update", move |event| {
                if let Ok(payload) = serde_json::from_str::<TrayPayload>(event.payload()) {
                    update_tray(&tray_handle, &payload);
                }
            });
            // The web page asks us to hide it (Enter-submitted or Esc).
            let handle = app.handle().clone();
            app.listen_any("capture:close", move |_| {
                if let Some(win) = handle.get_webview_window("capture") {
                    let _ = win.hide();
                }
            });
            // External links forwarded by EXTERNAL_LINKS_JS → system browser.
            app.listen_any("shell:open-external", move |event| {
                if let Ok(url) = serde_json::from_str::<String>(event.payload()) {
                    open_externally(&url);
                }
            });
            Ok(())
        })
        .on_page_load(|webview, _payload| {
            let _ = webview.eval(EXTERNAL_LINKS_JS);
        })
        .on_window_event(|window, event| {
            // Mac convention: the red button closes the window, not the app.
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
            // Click-away dismisses the capture palette, like Spotlight.
            if window.label() == "capture" {
                if let tauri::WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            }
        })
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .build(tauri::generate_context!())
        .expect("error while building Symphony")
        .run(|app, event| {
            // Dock-icon click with no visible windows restores the main window.
            if let tauri::RunEvent::Reopen { .. } = event {
                show_main(app);
            }
        });
}
