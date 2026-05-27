use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, Rect, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "menubar";
const DASHBOARD_WINDOW_LABEL: &str = "dashboard";
const TRAY_ID: &str = "pomotree-menubar";
const SHOW_MENU_ID: &str = "show";
const OPEN_DASHBOARD_MENU_ID: &str = "open_dashboard";
const QUIT_MENU_ID: &str = "quit";
const WINDOW_MARGIN: i32 = 12;
const TRAY_VERTICAL_GAP: i32 = 6;

#[derive(Clone, Copy)]
struct TrayAnchor {
    position: PhysicalPosition<f64>,
    rect: Rect,
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        position_main_window(app, None);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_main_window(app: &AppHandle, tray_anchor: Option<TrayAnchor>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let is_visible = window.is_visible().unwrap_or(false);
        let is_focused = window.is_focused().unwrap_or(false);

        if !is_visible {
            position_main_window(app, tray_anchor);
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        } else if is_focused {
            let _ = window.hide();
        } else {
            position_main_window(app, tray_anchor);
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

// Positioning v1:
// - tray icon clicks use Tauri's tray event rect to place the window under the icon;
// - menu/Dock activation falls back to the top-right of the cursor monitor, then primary monitor.
fn position_main_window(app: &AppHandle, tray_anchor: Option<TrayAnchor>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    let window_size = window
        .outer_size()
        .or_else(|_| window.inner_size())
        .unwrap_or_else(|_| PhysicalSize::new(380, 560));
    let window_width = window_size.width as i32;
    let window_height = window_size.height as i32;

    let monitor = monitor_for_anchor(app, tray_anchor)
        .or_else(|| cursor_monitor(app))
        .or_else(|| app.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        return;
    };

    let (x, y) = match tray_anchor {
        Some(anchor) => tray_relative_position(&monitor, anchor, window_width, window_height),
        None => top_right_position(&monitor, window_width, window_height),
    };

    let _ = window.set_position(PhysicalPosition::new(x, y));
}

fn monitor_for_anchor(app: &AppHandle, tray_anchor: Option<TrayAnchor>) -> Option<Monitor> {
    let anchor = tray_anchor?;
    app.monitor_from_point(anchor.position.x, anchor.position.y)
        .ok()
        .flatten()
}

fn cursor_monitor(app: &AppHandle) -> Option<Monitor> {
    let cursor = app.cursor_position().ok()?;
    app.monitor_from_point(cursor.x, cursor.y).ok().flatten()
}

fn tray_relative_position(
    monitor: &Monitor,
    anchor: TrayAnchor,
    window_width: i32,
    window_height: i32,
) -> (i32, i32) {
    let scale_factor = monitor.scale_factor();
    let rect_position = anchor.rect.position.to_physical::<i32>(scale_factor);
    let rect_size = anchor.rect.size.to_physical::<u32>(scale_factor);
    let rect_center_x = rect_position.x + (rect_size.width as i32 / 2);
    let rect_bottom_y = rect_position.y + rect_size.height as i32;
    let has_usable_rect = rect_size.width > 0
        && rect_size.height > 0
        && point_inside_monitor(monitor, rect_center_x, rect_bottom_y);
    let anchor_x = if has_usable_rect {
        rect_center_x
    } else {
        anchor.position.x.round() as i32
    };
    let anchor_y = if has_usable_rect {
        rect_bottom_y
    } else {
        anchor.position.y.round() as i32
    };
    let x = anchor_x - (window_width / 2);
    let y = anchor_y + TRAY_VERTICAL_GAP;

    clamp_to_monitor(monitor, x, y, window_width, window_height)
}

fn point_inside_monitor(monitor: &Monitor, x: i32, y: i32) -> bool {
    let position = monitor.position();
    let size = monitor.size();
    x >= position.x
        && x <= position.x + size.width as i32
        && y >= position.y
        && y <= position.y + size.height as i32
}

fn top_right_position(monitor: &Monitor, window_width: i32, window_height: i32) -> (i32, i32) {
    let work_area = monitor.work_area();
    let x = work_area.position.x + work_area.size.width as i32 - window_width - WINDOW_MARGIN;
    let y = work_area.position.y + WINDOW_MARGIN;

    clamp_to_monitor(monitor, x, y, window_width, window_height)
}

fn clamp_to_monitor(
    monitor: &Monitor,
    x: i32,
    y: i32,
    window_width: i32,
    window_height: i32,
) -> (i32, i32) {
    let work_area = monitor.work_area();
    let min_x = work_area.position.x + WINDOW_MARGIN;
    let min_y = work_area.position.y + WINDOW_MARGIN;
    let max_x = work_area.position.x + work_area.size.width as i32 - window_width - WINDOW_MARGIN;
    let max_y = work_area.position.y + work_area.size.height as i32 - window_height - WINDOW_MARGIN;

    (clamp_axis(x, min_x, max_x), clamp_axis(y, min_y, max_y))
}

fn clamp_axis(value: i32, min: i32, max: i32) -> i32 {
    if max < min {
        min
    } else {
        value.clamp(min, max)
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

#[tauri::command]
fn set_menubar_status(app: AppHandle, title: String) -> Result<(), String> {
    let title = title.trim();
    let safe_title = if title.is_empty() {
        "🍅".to_string()
    } else {
        title.chars().take(24).collect()
    };

    app.tray_by_id(TRAY_ID)
        .ok_or_else(|| "Pomotree tray icon is unavailable".to_string())?
        .set_title(Some(safe_title))
        .map_err(|error| error.to_string())
}

pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![set_menubar_status])
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

            TrayIconBuilder::with_id(TRAY_ID)
                .tooltip("Pomotree")
                .title("🍅")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        rect,
                        ..
                    } = event
                    {
                        toggle_main_window(tray.app_handle(), Some(TrayAnchor { position, rect }));
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
