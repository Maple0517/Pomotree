use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "menubar";
const DASHBOARD_WINDOW_LABEL: &str = "dashboard";
const SHOW_MENU_ID: &str = "show";
const OPEN_DASHBOARD_MENU_ID: &str = "open_dashboard";
const QUIT_MENU_ID: &str = "quit";

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let is_visible = window.is_visible().unwrap_or(false);
        let is_focused = window.is_focused().unwrap_or(false);

        if !is_visible {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        } else if is_focused {
            let _ = window.hide();
        } else {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

fn dashboard_url() -> WebviewUrl {
    if tauri::is_dev() {
        WebviewUrl::External(
            "http://localhost:3000/"
                .parse()
                .expect("valid dashboard dev URL"),
        )
    } else {
        WebviewUrl::App("index.html".into())
    }
}

fn open_dashboard_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(DASHBOARD_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let _ = WebviewWindowBuilder::new(app, DASHBOARD_WINDOW_LABEL, dashboard_url())
        .title("Pomotree Dashboard")
        .inner_size(1100.0, 760.0)
        .min_inner_size(900.0, 620.0)
        .center()
        .resizable(true)
        .focused(true)
        .build();
}

pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let show_item =
                MenuItem::with_id(app, SHOW_MENU_ID, "Show Pomotree", true, None::<&str>)?;
            let dashboard_item = MenuItem::with_id(
                app,
                OPEN_DASHBOARD_MENU_ID,
                "Open Dashboard",
                true,
                None::<&str>,
            )?;
            let quit_item =
                MenuItem::with_id(app, QUIT_MENU_ID, "Quit Pomotree", true, Some("Cmd+Q"))?;
            let tray_menu = Menu::with_items(
                app,
                &[
                    &show_item,
                    &dashboard_item,
                    &PredefinedMenuItem::separator(app)?,
                    &quit_item,
                ],
            )?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("missing app icon").clone())
                .icon_as_template(true)
                .tooltip("Pomotree")
                .title("🍅")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            show_main_window(app.handle());
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            SHOW_MENU_ID => show_main_window(app),
            OPEN_DASHBOARD_MENU_ID => open_dashboard_window(app),
            QUIT_MENU_ID => app.exit(0),
            _ => {}
        })
        .on_window_event(|window, event| {
            if window.label() == MAIN_WINDOW_LABEL {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Pomotree menubar app");

    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            show_main_window(app);
        }
    });
}
