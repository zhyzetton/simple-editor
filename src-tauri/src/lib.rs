use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

struct AppState {
    settings_file: PathBuf,
    workspace: Mutex<Option<PathBuf>>,
}

#[derive(Serialize, Deserialize, Default)]
struct Settings {
    workspace: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WorkspaceInfo {
    path: String,
    name: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EntryNode {
    name: String,
    path: String,
    is_dir: bool,
    modified_at: u64,
    children: Vec<EntryNode>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileMeta {
    path: String,
    title: String,
    dir: String,
    modified_at: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileDoc {
    path: String,
    title: String,
    dir: String,
    modified_at: u64,
    content: String,
    frontmatter: Option<String>,
    workspace_path: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AssetInfo {
    src: String,
    absolute_path: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn file_mtime_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn clean_path(path: &Path) -> String {
    let value = path.to_string_lossy().to_string();
    #[cfg(windows)]
    {
        if let Some(stripped) = value.strip_prefix("\\\\?\\") {
            return stripped.to_string();
        }
    }
    value
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            value.eq_ignore_ascii_case("md") || value.eq_ignore_ascii_case("markdown")
        })
        .unwrap_or(false)
}

fn split_frontmatter(raw: &str) -> (Option<String>, String) {
    let normalized = raw.replace("\r\n", "\n");
    if !normalized.starts_with("---\n") {
        return (None, normalized);
    }
    let rest = &normalized[4..];
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end_matches('\n') == "---" {
            let meta = rest[..offset].trim_end_matches('\n').to_string();
            let body_start = offset + line.len();
            return (Some(meta), rest[body_start..].to_string());
        }
        offset += line.len();
    }
    (None, normalized)
}

fn write_markdown(path: &Path, content: &str, frontmatter: Option<&str>) -> Result<(), String> {
    let content = content.replace("\r\n", "\n");
    let raw = match frontmatter {
        Some(meta) => format!("---\n{}\n---\n{}", meta.trim_end_matches('\n'), content),
        None => content,
    };
    fs::write(path, raw).map_err(|error| format!("保存失败：{error}"))
}

fn stem_title(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "未命名".to_string())
}

fn build_file_meta(path: &Path, api_path: String) -> Result<FileMeta, String> {
    let dir = path
        .parent()
        .ok_or_else(|| "无法解析文件目录".to_string())?;
    Ok(FileMeta {
        path: api_path,
        title: stem_title(path),
        dir: clean_path(dir),
        modified_at: file_mtime_ms(path),
    })
}

fn build_file_doc(
    path: &Path,
    api_path: String,
    workspace_path: Option<String>,
) -> Result<FileDoc, String> {
    let raw = fs::read_to_string(path).map_err(|error| format!("无法读取文件：{error}"))?;
    let (frontmatter, content) = split_frontmatter(&raw);
    let meta = build_file_meta(path, api_path)?;
    Ok(FileDoc {
        path: meta.path,
        title: meta.title,
        dir: meta.dir,
        modified_at: meta.modified_at,
        content,
        frontmatter,
        workspace_path,
    })
}

fn current_workspace(state: &AppState) -> Result<PathBuf, String> {
    state
        .workspace
        .lock()
        .map_err(|_| "工作区状态异常".to_string())?
        .clone()
        .ok_or_else(|| "尚未打开工作区".to_string())
}

fn workspace_info(root: &Path) -> WorkspaceInfo {
    WorkspaceInfo {
        path: clean_path(root),
        name: root
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "工作区".to_string()),
    }
}

fn persist_workspace(state: &AppState, path: Option<&Path>) -> Result<(), String> {
    let settings = Settings {
        workspace: path.map(clean_path),
    };
    let raw = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(&state.settings_file, raw).map_err(|error| error.to_string())
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = relative.trim();
    if relative.is_empty() {
        return Ok(root.to_path_buf());
    }
    let path = Path::new(relative);
    if path.is_absolute() {
        return Err("必须使用工作区内的相对路径".to_string());
    }
    let mut result = root.to_path_buf();
    for component in path.components() {
        match component {
            Component::Normal(name) => {
                let name = name.to_string_lossy();
                if name == ".trash" {
                    return Err("该目录不可访问".to_string());
                }
                result.push(name.as_ref());
            }
            Component::CurDir => {}
            _ => return Err("路径包含非法片段".to_string()),
        }
    }
    Ok(result)
}

fn rel_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "路径不在工作区内".to_string())?;
    let mut parts = Vec::new();
    for component in relative.components() {
        if let Component::Normal(name) = component {
            parts.push(name.to_string_lossy().to_string());
        }
    }
    Ok(parts.join("/"))
}

fn walk_dir(root: &Path, dir: &Path, depth: usize) -> Result<Vec<EntryNode>, String> {
    let mut nodes = Vec::new();
    if depth > 24 {
        return Ok(nodes);
    }
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(nodes),
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            let children = walk_dir(root, &path, depth + 1).unwrap_or_default();
            nodes.push(EntryNode {
                name,
                path: rel_path(root, &path)?,
                is_dir: true,
                modified_at: file_mtime_ms(&path),
                children,
            });
        } else if file_type.is_file() && is_markdown(&path) {
            nodes.push(EntryNode {
                name,
                path: rel_path(root, &path)?,
                is_dir: false,
                modified_at: file_mtime_ms(&path),
                children: Vec::new(),
            });
        }
    }
    nodes.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(nodes)
}

fn validate_name(raw: &str, extension: Option<&str>) -> Result<String, String> {
    let mut name = raw.trim().to_string();
    if name.is_empty() {
        return Err("名称不能为空".to_string());
    }
    if name == "." || name == ".." {
        return Err("名称无效".to_string());
    }
    if name.chars().count() > 120 {
        return Err("名称过长".to_string());
    }
    if name.chars().any(|character| {
        character.is_control()
            || matches!(character, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
    }) {
        return Err("名称包含非法字符".to_string());
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return Err("名称不能以点或空格结尾".to_string());
    }
    if let Some(extension) = extension {
        let lower = name.to_lowercase();
        if !(lower.ends_with(".md") || lower.ends_with(".markdown")) {
            name.push_str(extension);
        }
    }
    Ok(name)
}

fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let target = dir.join(name);
    if !target.exists() {
        return target;
    }
    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(name);
    let extension = path.extension().and_then(|value| value.to_str());
    for index in 2..1000 {
        let candidate = match extension {
            Some(extension) => format!("{stem} {index}.{extension}"),
            None => format!("{stem} {index}"),
        };
        let candidate_path = dir.join(candidate);
        if !candidate_path.exists() {
            return candidate_path;
        }
    }
    dir.join(format!("{stem}-{}", &Uuid::new_v4().to_string()[..8]))
}

fn store_asset(target_dir: &Path, file_name: &str, data: &[u8]) -> Result<AssetInfo, String> {
    if !target_dir.is_absolute() {
        return Err("资源目录必须是绝对路径".to_string());
    }
    if !target_dir.is_dir() {
        return Err("资源目录不存在".to_string());
    }
    let extension = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 8
                && value.chars().all(|character| character.is_ascii_alphanumeric())
        })
        .unwrap_or_else(|| "png".to_string());
    let name = format!(
        "{}-{}.{}",
        now_ms(),
        &Uuid::new_v4().to_string()[..8],
        extension
    );
    let assets = target_dir.join("assets");
    fs::create_dir_all(&assets).map_err(|error| format!("无法创建资源目录：{error}"))?;
    let path = assets.join(&name);
    fs::write(&path, data).map_err(|error| format!("无法保存图片：{error}"))?;
    Ok(AssetInfo {
        src: format!("assets/{name}"),
        absolute_path: clean_path(&path),
    })
}

#[tauri::command]
fn get_workspace(state: State<'_, AppState>) -> Option<WorkspaceInfo> {
    let guard = state.workspace.lock().ok()?;
    guard.as_ref().map(|root| workspace_info(root))
}

#[tauri::command]
fn open_workspace(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<WorkspaceInfo, String> {
    let root = fs::canonicalize(PathBuf::from(&path))
        .map_err(|_| "文件夹不存在或无法访问".to_string())?;
    if !root.is_dir() {
        return Err("请选择一个文件夹".to_string());
    }
    app.asset_protocol_scope()
        .allow_directory(&root, true)
        .map_err(|error| error.to_string())?;
    {
        let mut guard = state
            .workspace
            .lock()
            .map_err(|_| "工作区状态异常".to_string())?;
        *guard = Some(root.clone());
    }
    persist_workspace(&state, Some(&root))?;
    Ok(workspace_info(&root))
}

#[tauri::command]
fn list_tree(state: State<'_, AppState>) -> Result<Vec<EntryNode>, String> {
    let root = current_workspace(&state)?;
    walk_dir(&root, &root, 0)
}

#[tauri::command]
fn read_workspace_file(state: State<'_, AppState>, path: String) -> Result<FileDoc, String> {
    let root = current_workspace(&state)?;
    let full = safe_join(&root, &path)?;
    if !full.is_file() || !is_markdown(&full) {
        return Err("Markdown 文件不存在".to_string());
    }
    build_file_doc(&full, rel_path(&root, &full)?, None)
}

#[tauri::command]
fn save_workspace_file(
    state: State<'_, AppState>,
    path: String,
    content: String,
    frontmatter: Option<String>,
) -> Result<FileMeta, String> {
    let root = current_workspace(&state)?;
    let full = safe_join(&root, &path)?;
    if !full.is_file() || !is_markdown(&full) {
        return Err("文件已被移动或删除".to_string());
    }
    write_markdown(&full, &content, frontmatter.as_deref())?;
    build_file_meta(&full, rel_path(&root, &full)?)
}

#[tauri::command]
fn create_workspace_file(
    state: State<'_, AppState>,
    parent: Option<String>,
    name: String,
) -> Result<FileDoc, String> {
    let root = current_workspace(&state)?;
    let parent_path = safe_join(&root, parent.as_deref().unwrap_or(""))?;
    if !parent_path.is_dir() {
        return Err("目标文件夹不存在".to_string());
    }
    let file_name = validate_name(&name, Some(".md"))?;
    let target = unique_path(&parent_path, &file_name);
    write_markdown(&target, "", None)?;
    build_file_doc(&target, rel_path(&root, &target)?, None)
}

#[tauri::command]
fn create_workspace_folder(
    state: State<'_, AppState>,
    parent: Option<String>,
    name: String,
) -> Result<String, String> {
    let root = current_workspace(&state)?;
    let parent_path = safe_join(&root, parent.as_deref().unwrap_or(""))?;
    if !parent_path.is_dir() {
        return Err("目标文件夹不存在".to_string());
    }
    let folder_name = validate_name(&name, None)?;
    let target = unique_path(&parent_path, &folder_name);
    fs::create_dir(&target).map_err(|error| format!("创建文件夹失败：{error}"))?;
    rel_path(&root, &target)
}

#[tauri::command]
fn rename_workspace_file(
    state: State<'_, AppState>,
    path: String,
    new_name: String,
) -> Result<FileMeta, String> {
    let root = current_workspace(&state)?;
    let full = safe_join(&root, &path)?;
    if !full.is_file() || !is_markdown(&full) {
        return Err("文件已被移动或删除".to_string());
    }
    let parent = full
        .parent()
        .ok_or_else(|| "无法解析文件目录".to_string())?;
    let extension = full
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_else(|| ".md".to_string());
    let file_name = validate_name(&new_name, Some(&extension))?;
    let target = parent.join(&file_name);
    if target != full {
        if target.exists() {
            return Err("同名文件已存在".to_string());
        }
        fs::rename(&full, &target).map_err(|error| format!("重命名失败：{error}"))?;
    }
    build_file_meta(&target, rel_path(&root, &target)?)
}

#[tauri::command]
fn delete_workspace_file(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let root = current_workspace(&state)?;
    let full = safe_join(&root, &path)?;
    if !full.is_file() {
        return Ok(());
    }
    let trash = root.join(".trash");
    fs::create_dir_all(&trash).map_err(|error| error.to_string())?;
    let file_name = full
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "document.md".to_string());
    let target = unique_path(&trash, &format!("{}-{file_name}", now_ms()));
    fs::rename(&full, target).map_err(|error| format!("删除失败：{error}"))
}

#[tauri::command]
fn read_external_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<FileDoc, String> {
    let full = fs::canonicalize(PathBuf::from(&path))
        .map_err(|_| "文件不存在或无法访问".to_string())?;
    if !full.is_file() || !is_markdown(&full) {
        return Err("请选择 Markdown 文件".to_string());
    }
    if let Some(parent) = full.parent() {
        let _ = app.asset_protocol_scope().allow_directory(parent, true);
    }
    let mut workspace_relative = None;
    if let Ok(root) = current_workspace(&state) {
        if let (Ok(canonical_root), Ok(canonical_file)) =
            (fs::canonicalize(&root), fs::canonicalize(&full))
        {
            if canonical_file.strip_prefix(&canonical_root).is_ok() {
                workspace_relative = Some(rel_path(&canonical_root, &canonical_file)?);
            }
        }
    }
    build_file_doc(&full, clean_path(&full), workspace_relative)
}

#[tauri::command]
fn save_external_file(
    path: String,
    content: String,
    frontmatter: Option<String>,
) -> Result<FileMeta, String> {
    let full = PathBuf::from(&path);
    if !full.is_absolute() || !full.is_file() || !is_markdown(&full) {
        return Err("文件已被移动或删除".to_string());
    }
    write_markdown(&full, &content, frontmatter.as_deref())?;
    build_file_meta(&full, clean_path(&full))
}

#[tauri::command]
fn rename_external_file(path: String, new_name: String) -> Result<FileMeta, String> {
    let full = PathBuf::from(&path);
    if !full.is_absolute() || !full.is_file() || !is_markdown(&full) {
        return Err("文件已被移动或删除".to_string());
    }
    let parent = full
        .parent()
        .ok_or_else(|| "无法解析文件目录".to_string())?;
    let extension = full
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_else(|| ".md".to_string());
    let file_name = validate_name(&new_name, Some(&extension))?;
    let target = parent.join(&file_name);
    if target != full {
        if target.exists() {
            return Err("同名文件已存在".to_string());
        }
        fs::rename(&full, &target).map_err(|error| format!("重命名失败：{error}"))?;
    }
    build_file_meta(&target, clean_path(&target))
}

#[tauri::command]
fn save_asset(
    target_dir: String,
    file_name: String,
    data_base64: String,
) -> Result<AssetInfo, String> {
    let data = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|error| format!("图片数据无效：{error}"))?;
    store_asset(Path::new(&target_dir), &file_name, &data)
}

#[tauri::command]
fn import_asset(target_dir: String, source_path: String) -> Result<AssetInfo, String> {
    let source = PathBuf::from(&source_path);
    let file_name = source
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "image.png".to_string());
    let data = fs::read(&source).map_err(|error| format!("无法读取图片：{error}"))?;
    store_asset(Path::new(&target_dir), &file_name, &data)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let base = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            fs::create_dir_all(&base).map_err(|error| error.to_string())?;
            let settings_file = base.join("settings.json");
            let mut settings = fs::read_to_string(&settings_file)
                .ok()
                .and_then(|raw| serde_json::from_str::<Settings>(&raw).ok());
            if settings.is_none() {
                // 应用标识从 com.link.siyuaneditor 改成了 com.link.editor，首次启动时迁移上次工作区。
                let legacy_settings = base
                    .parent()
                    .map(|parent| parent.join("com.link.siyuaneditor").join("settings.json"));
                if let Some(legacy) = legacy_settings
                    .and_then(|path| fs::read_to_string(path).ok())
                    .and_then(|raw| serde_json::from_str::<Settings>(&raw).ok())
                {
                    if let Ok(serialized) = serde_json::to_string_pretty(&legacy) {
                        let _ = fs::write(&settings_file, serialized);
                    }
                    settings = Some(legacy);
                }
            }
            let workspace = settings
                .and_then(|settings| settings.workspace)
                .map(PathBuf::from)
                .map(|path| fs::canonicalize(&path).unwrap_or(path))
                .filter(|path| path.is_dir());
            if let Some(root) = &workspace {
                let _ = app.asset_protocol_scope().allow_directory(root, true);
            }
            app.manage(AppState {
                settings_file,
                workspace: Mutex::new(workspace),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_workspace,
            open_workspace,
            list_tree,
            read_workspace_file,
            save_workspace_file,
            create_workspace_file,
            create_workspace_folder,
            rename_workspace_file,
            delete_workspace_file,
            read_external_file,
            save_external_file,
            rename_external_file,
            save_asset,
            import_asset
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
