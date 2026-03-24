use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::BufReader;
use std::path::PathBuf;
use std::process::Command;
use flate2::read::GzDecoder;
use zip::ZipArchive;
use tar::Archive;
use xz2::read::XzDecoder;
use log::info;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub is_arm: bool,
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    let arch = std::env::consts::ARCH.to_string();
    let os = std::env::consts::OS.to_string();
    let is_arm = arch == "aarch64" || arch == "arm64";

    SystemInfo {
        os: os.to_string(),
        arch: arch.clone(),
        is_arm,
    }
}

#[tauri::command]
async fn download_file(url: String, dest_dir: String, file_name: String) -> Result<String, String> {
    let dest_path = PathBuf::from(&dest_dir);
    let file_path = dest_path.join(&file_name);

    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    info!("Downloading from: {}", url);
    
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    let mut file = File::create(&file_path).map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();

    use futures_util::stream::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }

    info!("Downloaded to {:?}", file_path);
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn download_and_extract(url: String, dest_dir: String, file_name: String) -> Result<String, String> {
    let file_path = download_file(url, dest_dir.clone(), file_name.clone()).await?;
    let dest_path = PathBuf::from(&dest_dir);
    extract_package(&PathBuf::from(&file_path), &dest_path)
}

fn extract_package(archive_path: &PathBuf, dest_dir: &PathBuf) -> Result<String, String> {
    let extension = archive_path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let file = File::open(archive_path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);

    match extension {
        "zip" => { ZipArchive::new(reader).map_err(|e| e.to_string())?.extract(dest_dir).map_err(|e| e.to_string())?; }
        "gz" => {
            if archive_path.file_stem().and_then(|s| s.to_str()).map(|s| s.ends_with(".tar")).unwrap_or(false) {
                let decoder = GzDecoder::new(reader);
                Archive::new(decoder).unpack(dest_dir).map_err(|e| e.to_string())?;
            }
        }
        "tar" => { Archive::new(reader).unpack(dest_dir).map_err(|e| e.to_string())?; }
        "xz" => { let file = File::open(archive_path).map_err(|e| e.to_string())?; let decoder = XzDecoder::new(file); Archive::new(decoder).unpack(dest_dir).map_err(|e| e.to_string())?; }
        "exe" | "pkg" => { return Ok(archive_path.to_string_lossy().to_string()); }
        _ => return Err(format!("Unsupported: {}", extension)),
    }
    Ok(dest_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn set_mirror(mirror_type: String, mirror_url: String, node_path: String) -> Result<String, String> {
    info!("set_mirror called: type={}, url={}, node_path={}", mirror_type, mirror_url, node_path);
    
    match mirror_type.as_str() {
        "npm" => {
            let full_cmd = if node_path.is_empty() {
                format!("npm config set registry {}", mirror_url)
            } else {
                let escaped_path = node_path.replace("'", "'\"'\"'");
                format!("export PATH=\"{0}:$PATH\" && npm config set registry {1}", escaped_path, mirror_url)
            };
            
            info!("Running: {}", full_cmd);
            
            #[cfg(target_os = "windows")]
            let output = Command::new("cmd").args(["/C", &full_cmd]).output();
            #[cfg(not(target_os = "windows"))]
            let output = std::process::Command::new("sh").arg("-c").arg(&full_cmd).output();

            match output {
                Ok(out) => {
                    let stdout = String::from_utf8_lossy(&out.stdout);
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    info!("stdout: {}, stderr: {}", stdout, stderr);
                    if out.status.success() {
                        Ok("npm done".to_string())
                    } else {
                        Err(format!("failed: {} | stdout: {}", stderr, stdout))
                    }
                }
                Err(e) => Err(format!("Error: {} (full_cmd: {})", e, full_cmd)),
            }
        }
        "pip" => {
            let pip_dir = dirs::config_dir().map(|p| p.join("pip")).ok_or("No config dir")?;
            fs::create_dir_all(&pip_dir).map_err(|e| e.to_string())?;
            fs::write(pip_dir.join("pip.ini"), format!("[global]\nindex-url = {}\n", mirror_url)).map_err(|e| e.to_string())?;
            Ok("pip mirror set".to_string())
        }
        _ => Ok("skipped".to_string()),
    }
}

#[tauri::command]
fn get_install_dir() -> String {
    dirs::data_local_dir().map(|p| p.join("DevEnvHelper").to_string_lossy().to_string()).unwrap_or_else(|| "./".to_string())
}

#[tauri::command]
fn cleanup_file(file_path: String) -> Result<String, String> {
    if file_path.ends_with("/") {
        fs::remove_dir_all(&file_path).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    }
    Ok("cleaned".to_string())
}

#[tauri::command]
fn run_command(cmd: String) -> Result<String, String> {
    info!("Running: {}", cmd);
    
    #[cfg(target_os = "windows")]
    let output = Command::new("cmd").args(["/C", &cmd]).output();
    #[cfg(not(target_os = "windows"))]
    let output = Command::new("sh").args(["-c", &cmd]).output();

    match output {
        Ok(out) => {
            if out.status.success() {
                Ok(String::from_utf8_lossy(&out.stdout).to_string())
            } else {
                Err(String::from_utf8_lossy(&out.stderr).to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn run_command_with_env(cmd: String, node_path: String) -> Result<String, String> {
    info!("Running with env: {} at {}", cmd, node_path);
    
    let full_cmd = if node_path.is_empty() {
        cmd.clone()
    } else {
        let escaped_path = node_path.replace("'", "'\"'\"'");
        format!("export PATH=\"{0}:$PATH\" && {1}", escaped_path, cmd)
    };
    
    info!("Full cmd: {}", full_cmd);
    
    #[cfg(target_os = "windows")]
    let output = Command::new("cmd").args(["/C", &full_cmd]).output();
    #[cfg(not(target_os = "windows"))]
    let output = Command::new("sh").args(["-c", &full_cmd]).output();

    match output {
        Ok(out) => {
            if out.status.success() {
                Ok(String::from_utf8_lossy(&out.stdout).to_string())
            } else {
                Ok(format!("stderr: {}", String::from_utf8_lossy(&out.stderr)))
            }
        }
        Err(e) => Err(format!("Error: {} (cmd: {})", e, full_cmd)),
    }
}

#[tauri::command]
fn run_command_background(cmd: String, node_path: String) -> Result<String, String> {
    info!("Running background: {} at {}", cmd, node_path);
    
    let safe_dir = dirs::home_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|| "/tmp".to_string());
    
    let full_cmd = if node_path.is_empty() {
        format!("cd \"{1}\" && nohup sh -c '{0}' > /tmp/openclaw-gw.log 2>&1 &", cmd.replace("'", "'\"'\"'"), safe_dir)
    } else {
        let escaped_path = node_path.replace("'", "'\"'\"'");
        format!("cd \"{1}\" && export PATH=\"{0}:$PATH\" && nohup sh -c '{2}' > /tmp/openclaw-gw.log 2>&1 &", escaped_path, safe_dir, cmd.replace("'", "'\"'\"'"))
    };
    
    info!("Full cmd: {}", full_cmd);
    
    #[cfg(target_os = "windows")]
    Command::new("cmd").args(["/C", "start", &cmd]).spawn().map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "windows"))]
    Command::new("sh").arg("-c").arg(&full_cmd).spawn().map_err(|e| e.to_string())?;

    Ok("started in background".to_string())
}

#[tauri::command]
fn set_env_var(name: String, value: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    { Command::new("setx").args([&name, &value]).output().map_err(|e| e.to_string())?; }
    
    #[cfg(not(target_os = "windows"))]
    {
        let profile = dirs::home_dir().map(|p| p.join(".zshrc")).unwrap_or_else(|| PathBuf::from(".zshrc"));
        let line = format!("\nexport {}={}\n", name, value);
        if profile.exists() {
            let mut c = fs::read_to_string(&profile).unwrap_or_default();
            if !c.contains(&format!("export {}=", name)) {
                c.push_str(&line);
                fs::write(&profile, c).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok("env set".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    info!("Starting...");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_system_info, download_file, download_and_extract,
            set_mirror, get_install_dir, cleanup_file,
            run_command, run_command_with_env, run_command_background, set_env_var
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
