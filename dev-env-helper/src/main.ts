import { invoke } from "@tauri-apps/api/core";

interface Config { ossBase: string; openclawPath: string; }

const config: Config = {
  ossBase: "https://openclaw-packages.oss-cn-shenzhen.aliyuncs.com",
  openclawPath: ""
};

interface SystemInfo { os: string; arch: string; is_arm: boolean; }

let systemInfo: SystemInfo | null = null;

const providerModels: Record<string, {url: string, models: string[], providerKey: string}> = {
  deepseek: { url: "https://api.deepseek.com/v1", models: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"], providerKey: "deepseek" },
  kimi: { url: "https://api.moonshot.cn/v1", models: ["kimi-k2.5", "kimi-k2-0905-preview", "kimi-k2-turbo-preview"], providerKey: "moonshot" },
  anthropic: { url: "https://api.anthropic.com", models: ["claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"], providerKey: "anthropic" },
  openai: { url: "https://api.openai.com/v1", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"], providerKey: "openai" },
  groq: { url: "https://api.groq.com/openai/v1", models: ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"], providerKey: "groq" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta", models: ["gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.5-flash-8b"], providerKey: "gemini" },
  ollama: { url: "http://localhost:11434/v1", models: ["llama3.3", "llama3.1", "qwen2.5", "codellama", "mistral", "deepseek-v2"], providerKey: "ollama" },
  zhipu: { url: "https://open.bigmodel.cn/api/paas/v4", models: ["glm-4", "glm-4-flash", "glm-4v", "glm-3-turbo"], providerKey: "zhipuai" },
  qwen: { url: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-coder-plus", "qwen-vl-plus"], providerKey: "qwen" },
  baidu: { url: "https://qianfan.baidubce.com/v3", models: ["ernie-4.0-8k", "ernie-3.5-8k", "ernie-speed-128k", "ernie-lite-8k"], providerKey: "baidu" },
  minimax: { url: "https://api.minimax.chat/v1", models: ["MiniMax-Text-01", "abab6.5s-chat", "abab5.5s-chat"], providerKey: "minimax" },
  siliconflow: { url: "https://api.siliconflow.cn/v1", models: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1", "Qwen/Qwen2.5-72B-Instruct", "01-ai/Yi-1.5-34B-Instruct"], providerKey: "siliconflow" },
  cloudflare: { url: "https://api.cloudflare.com/client/v4/ai", models: ["@cf/meta/llama-3.1-70b-instruct", "@cf/meta/llama-3.1-8b-instruct", "@cf/deepseek-ai/deepseek-coder-33b-instruct"], providerKey: "cloudflare" },
  custom: { url: "", models: [], providerKey: "custom" }
};

function log(msg: string, type: "info"|"success"|"error" = "info") {
  const el = document.getElementById("install-log");
  if (!el) return;
  const ts = new Date().toLocaleTimeString();
  const color = type==="error"?"#ff6b6b":type==="success"?"#28a745":"#0f0";
  el.innerHTML += `<span style="color:${color}">[${ts}] ${msg}</span>\n`;
  el.scrollTop = el.scrollHeight;
}

function setProgress(p: number) {
  const fill = document.getElementById("progress-fill");
  const text = document.getElementById("progress-text");
  if (fill) fill.style.width = p + "%";
  if (text) text.textContent = p + "%";
}

function setStepState(idx: number, state: string) {
  const steps = document.querySelectorAll(".step");
  const step = steps[idx];
  if (!step) return;
  step.classList.remove("active", "completed", "error");
  step.classList.add(state);
  const btn = step.querySelector(".step-btn") as HTMLButtonElement;
  if (btn) {
    btn.disabled = state === "active";
    btn.textContent = state === "completed" ? "✓" : (state === "error" ? "重试" : "执行");
  }
}

function getOssUrl(fn: string) { return `${config.ossBase}/${fn}`; }

function getNodeFileName() {
  const os = systemInfo?.os, arm = systemInfo?.is_arm;
  if (os === "macos") return arm ? "node-v22.18.0-darwin-arm64.tar.gz" : "node-v22.18.0-darwin-x64.tar.gz";
  if (os === "windows") return arm ? "node-v22.18.0-win-arm64.zip" : "node-v22.18.0-win-x64.zip";
  return arm ? "node-v22.18.0-linux-arm64.tar.xz" : "node-v22.18.0-linux-x64.tar.xz";
}

function getPythonFileName() {
  const os = systemInfo?.os, arm = systemInfo?.is_arm;
  if (os === "macos") return "python-3.11.9-macos11.pkg";
  if (os === "windows") return arm ? "python-3.11.9-arm64.exe" : "python-3.11.9-amd64.exe";
  return arm ? "Python-3.11.9-aarch64.tar.xz" : "Python-3.11.9.tar.xz";
}

function getNodeExtractDir() {
  const os = systemInfo?.os, arm = systemInfo?.is_arm;
  if (os === "windows") return "node-v22.18.0-win-x64";
  if (os === "macos") return `node-v22.18.0-darwin-${arm?'arm64':'x64'}`;
  return `node-v22.18.0-linux-${arm?'arm64':'x64'}`;
}

async function step1_InstallNode() {
  setStepState(0, "active");
  log(`系统: ${systemInfo?.os} ${systemInfo?.arch}`);
  try {
    const fn = getNodeFileName();
    const url = getOssUrl(fn);
    const dir = await invoke<string>("get_install_dir");
    log("下载: " + fn);
    await invoke("download_and_extract", { url, destDir: dir + "/node", fileName: fn });
    const binDir = `${dir}/node/${getNodeExtractDir()}/bin`;
    await invoke("set_env_var", { name: "PATH", value: binDir });
    setStepState(0, "completed");
    setProgress(20);
    log("✓ Node.js 安装完成", "success");
  } catch(e) { log("失败: " + e, "error"); setStepState(0, "error"); }
}

async function step2_MirrorAndPnpm() {
  setStepState(1, "active");
  try {
    const dir = await invoke<string>("get_install_dir");
    const binDir = `${dir}/node/${getNodeExtractDir()}/bin`;
    log("binDir: " + binDir);
    
    const result = await invoke<string>("set_mirror", { mirrorType: "npm", mirrorUrl: "https://registry.npmmirror.com", nodePath: binDir });
    log("Result: " + result);
    log("✓ npm 镜像");
    try { await invoke("set_mirror", { mirrorType: "pip", mirrorUrl: "https://pypi.tuna.tsinghua.edu.cn", nodePath: "" }); } catch{}
    log("✓ pip 镜像");
    
    // 尝试 npm 安装 pnpm（更快）
    log("安装 pnpm...");
    try {
      const result2 = await invoke<string>("run_command_with_env", { cmd: "npm install -g pnpm", nodePath: binDir });
      log(result2 || "✓ pnpm 已安装");
    } catch(e) {
      log("npm 安装失败: " + e);
    }
    
    setStepState(1, "completed");
    setProgress(40);
  } catch(e) { log("失败: " + e, "error"); setStepState(1, "error"); }
}

async function step3_Python() {
  setStepState(2, "active");
  try {
    const fn = getPythonFileName();
    const url = getOssUrl(fn);
    const dir = await invoke<string>("get_install_dir");
    log("下载: " + fn);
    await invoke("download_file", { url, destDir: dir + "/python", fileName: fn });
    setStepState(2, "completed");
    setProgress(60);
    log("✓ Python 包已下载到: " + dir + "/python", "success");
    log("如需安装请双击 pkg 文件", "info");
  } catch(e) { log("失败: " + e, "error"); setStepState(2, "error"); }
}

async function step4_Playwright() {
  setStepState(3, "active");
  try {
    const dir = await invoke<string>("get_install_dir");
    const binDir = `${dir}/node/${getNodeExtractDir()}/bin`;
    log("binDir: " + binDir);
    log("安装 playwright...");
    const result = await invoke<string>("run_command_with_env", { cmd: "npm install -g playwright", nodePath: binDir });
    log(result);
    log("安装 chromium...");
    const result2 = await invoke<string>("run_command_with_env", { cmd: "npx playwright install chromium", nodePath: binDir });
    log(result2);
    setStepState(3, "completed");
    setProgress(80);
    log("✓ Playwright 安装完成", "success");
  } catch(e) { log("失败: " + e, "error"); setStepState(3, "error"); }
}

async function step5_CloneAndRun() {
  setStepState(4, "active");
  try {
    const dir = await invoke<string>("get_install_dir");
    const binDir = `${dir}/node/${getNodeExtractDir()}/bin`;
    
    // 如果有手动路径则使用，否则创建默认路径
    let openclawDir = config.openclawPath.trim() || (dir + "/openclaw");
    const isManualPath = !!config.openclawPath.trim();
    
    if (!isManualPath) {
      // 清理旧目录
      log("清理目录: " + openclawDir);
      try { await invoke("cleanup_file", { filePath: openclawDir + "/" }); } catch {}
      
      // 方法1: 从 OSS 下载
      const ossUrl = `${config.ossBase}/openclaw-main.zip`;
      log("尝试从 OSS 下载: " + ossUrl);
      try {
        await invoke<string>("download_file", { url: ossUrl, destDir: dir, fileName: "openclaw.zip" });
        log("下载完成，解压中...");
        const zipPath = `${dir}/openclaw.zip`;
        await invoke<string>("run_command", { cmd: `unzip -o "${zipPath}" -d "${dir}/openclaw-temp/"` });
        // 移动文件
        await invoke<string>("run_command", { cmd: `mv "${dir}/openclaw-temp/openclaw-main" "${openclawDir}"` });
        await invoke<string>("run_command", { cmd: `rm -rf "${dir}/openclaw-temp" "${zipPath}"` });
        log("从 OSS 下载成功!");
      } catch(e) {
        log("OSS 下载失败: " + String(e).substring(0, 80));
        
        // 方法2: 从 GitHub 克隆
        const gitUrl = "https://github.com/openclaw/openclaw.git";
        const mirrors = [
          "https://ghproxy.com/" + gitUrl,
          "https://mirror.ghproxy.com/" + gitUrl,
        ];
        let cloned = false;
        for (const url of mirrors) {
          try {
            log("尝试克隆: " + url);
            await invoke<string>("run_command_with_env", { cmd: `git clone --depth 1 "${url}" "${openclawDir}"`, nodePath: binDir });
            await new Promise(r => setTimeout(r, 2000));
            try {
              await invoke<string>("run_command", { cmd: `ls "${openclawDir}"` });
              log("克隆成功!");
              cloned = true;
              break;
            } catch {}
          } catch(e2) {
            log("失败: " + String(e2).substring(0, 80));
          }
        }
        if (!cloned) {
          log("错误: GitHub 无法访问");
          log("请手动克隆仓库到: " + openclawDir);
          setStepState(4, "error");
          return;
        }
      }
    } else {
      log("使用手动路径: " + openclawDir);
    }
    
    // 检查目录是否存在
    await new Promise(r => setTimeout(r, 2000));
    try {
      const checkResult = await invoke<string>("run_command", { cmd: `ls "${openclawDir}"` });
      log("目录内容: " + (checkResult || "空").substring(0, 200));
    } catch(e) { 
      log("检查目录失败: " + e); 
      setStepState(4, "error");
      return;
    }
    
    // 检查是否克隆成功
    await new Promise(r => setTimeout(r, 3000));
    try {
      const checkResult = await invoke<string>("run_command", { cmd: `ls -la "${openclawDir}"` });
      log("目录内容: " + (checkResult || "空").substring(0, 200));
    } catch(e) { log("检查目录: " + e); }
    
    // 检查并安装 pnpm
    log("检查 pnpm...");
    try {
      await invoke<string>("run_command_with_env", { cmd: "pnpm --version", nodePath: binDir });
    } catch {
      log("安装 pnpm...");
      await invoke<string>("run_command_with_env", { cmd: "npm install -g pnpm", nodePath: binDir });
    }
    
    // 安装依赖
    log("安装依赖 (pnpm install)...");
    const installResult = await invoke<string>("run_command_with_env", { cmd: `cd "${openclawDir}" && pnpm install`, nodePath: binDir });
    log("安装结果: " + (installResult || "完成").substring(0, 500));
    
    // 下载并解压 UI
    log("下载 UI...");
    try {
      await invoke<string>("download_file", { url: `${config.ossBase}/control-ui.zip`, destDir: openclawDir + "/dist", fileName: "control-ui.zip" });
      log("解压 UI...");
      await invoke<string>("run_command", { cmd: `cd "${openclawDir}/dist" && unzip -o control-ui.zip && rm -f control-ui.zip` });
      // 创建 control-ui 子目录（如果不存在）
      await invoke<string>("run_command", { cmd: `mkdir -p "${openclawDir}/dist/control-ui"` });
      // 将文件复制到 control-ui 子目录
      await invoke<string>("run_command", { cmd: `cp "${openclawDir}/dist/index.html" "${openclawDir}/dist/favicon.ico" "${openclawDir}/dist/favicon.svg" "${openclawDir}/dist/favicon-32.png" "${openclawDir}/dist/apple-touch-icon.png" "${openclawDir}/dist/control-ui/" 2>/dev/null || true` });
      await invoke<string>("run_command", { cmd: `cp -r "${openclawDir}/dist/assets" "${openclawDir}/dist/control-ui/" 2>/dev/null || true` });
    } catch(e) {
      log("UI 下载失败，将在线构建: " + String(e).substring(0, 80));
      await invoke("run_command_with_env", { cmd: `cd "${openclawDir}" && pnpm ui:build &`, nodePath: binDir });
      log("UI 构建中，等待 120 秒...");
      await new Promise(r => setTimeout(r, 120000));
    }
    
    // 启动 (后台运行)
    log("启动 OpenClaw Gateway...");
    await invoke("run_command_with_env", { cmd: `cd "${openclawDir}" && pnpm start gateway &`, nodePath: binDir });
    
    // 等待 Gateway 启动
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const check = await invoke<string>("run_command", { cmd: `lsof -i :18789` });
        if (check && check.includes("node")) {
          log("Gateway 已启动!");
          break;
        }
      } catch {}
      log("等待 Gateway 启动... " + (i+1) * 2 + "秒");
    }
    
    // 创建默认配置文件
    log("创建配置文件...");
    const homeResult = await invoke<string>("run_command", { cmd: `echo $HOME` });
    const homeDir = homeResult.trim();
    await invoke<string>("run_command", { cmd: `mkdir -p "${homeDir}/.openclaw"` });
    
    // 生成 token 并创建配置
    const tokenResult = await invoke<string>("run_command", { cmd: `openssl rand -hex 16` });
    const token = tokenResult.trim();
    
    // Create openclaw.json (gateway config only - NOT models.providers)
    const defaultConfig = {
      gateway: { 
        mode: "local", 
        auth: { token },
        http: {
          endpoints: {
            chatCompletions: { enabled: true }
          }
        }
      },
      agents: {
        defaults: {
          model: "deepseek/deepseek-chat"
        }
      }
    };
    await invoke<string>("run_command", { cmd: `echo '${JSON.stringify(defaultConfig, null, 2)}' > "${homeDir}/.openclaw/openclaw.json"` });
    
    // Create agent directory
    await invoke<string>("run_command", { cmd: `mkdir -p "${homeDir}/.openclaw/agents/main/agent"` });
    
    // Create models.json with correct format for custom provider
    const defaultModels = {
      providers: {
        deepseek: {
          apiKey: "",
          baseUrl: "https://api.deepseek.com/v1",
          api: "openai-completions",
          models: [
            { id: "deepseek-chat", name: "DeepSeek Chat", input: ["text"], contextWindow: 195000 }
          ]
        }
      }
    };
    await invoke<string>("run_command", { cmd: `echo '${JSON.stringify(defaultModels, null, 2)}' > "${homeDir}/.openclaw/agents/main/agent/models.json"` });
    
    // Create auth-profiles.json
    const defaultAuth = {
      version: 1,
      profiles: {
        deepseek: {
          type: "api_key",
          provider: "deepseek",
          key: ""
        }
      }
    };
    await invoke<string>("run_command", { cmd: `echo '${JSON.stringify(defaultAuth, null, 2)}' > "${homeDir}/.openclaw/agents/main/agent/auth-profiles.json"` });
    
    log("✓ 配置文件已创建");
    
    // 打开 Dashboard
    log("打开 Dashboard...");
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(`http://127.0.0.1:18789/#token=${token}`);
    
    setStepState(4, "completed");
    setProgress(100);
    log("🎉 安装完成！", "success");
    log("请在右侧配置 API Key 并保存", "info");
  } catch(e) { log("失败: " + e, "error"); setStepState(0, "error"); }
}

async function step_OneClickInstall() {
  const overlay = document.getElementById("loading-overlay");
  const loadingText = document.getElementById("loading-text");
  if (overlay) overlay.classList.add("active");
  
  setStepState(0, "active");
  setProgress(0);
  
  try {
    // Step 1: Install Node.js
    log("=== 开始一键安装 ===");
    setProgress(10);
    if (loadingText) loadingText.textContent = "安装 Node.js...";
    log("步骤 1/5: 安装 Node.js...");
    await step1_InstallNode();
    setProgress(30);
    
    // Step 2: Mirror and pnpm
    if (loadingText) loadingText.textContent = "配置镜像...";
    log("步骤 2/5: 配置镜像 + 安装 pnpm...");
    await step2_MirrorAndPnpm();
    setProgress(50);
    
    // Step 3: OpenClaw
    if (loadingText) loadingText.textContent = "下载 OpenClaw...";
    log("步骤 3/5: 下载 OpenClaw...");
    await step3_Python();
    setProgress(60);
    
    // Step 4: Playwright (optional)
    if (loadingText) loadingText.textContent = "安装 Playwright...";
    log("步骤 4/5: 安装 Playwright (可选)...");
    try {
      await step4_Playwright();
    } catch(e) {
      log("Playwright 安装失败，继续..." );
    }
    setProgress(75);
    
    // Step 5: Clone and run
    if (loadingText) loadingText.textContent = "启动网关...";
    log("步骤 5/5: 启动 OpenClaw Gateway...");
    await step5_CloneAndRun();
    setProgress(100);
    
    setStepState(0, "completed");
    log("=== 安装完成 ===", "success");
    log("请在浏览器打开 http://localhost:18789 配置 API Key");
    
    if (overlay) overlay.classList.remove("active");
  } catch(e) {
    log("安装失败: " + e, "error");
    setStepState(0, "error");
    if (overlay) overlay.classList.remove("active");
  }
}

async function runStep(action: string) {
  if (action === "install") await step_OneClickInstall();
}

window.addEventListener("DOMContentLoaded", async () => {
  systemInfo = await invoke<SystemInfo>("get_system_info");
  log(`检测: ${systemInfo.os} ${systemInfo.arch}`, "info");
  
  document.querySelectorAll(".step-btn").forEach(btn => {
    btn.addEventListener("click", () => runStep(btn.getAttribute("data-action") || ""));
  });
  
  log("准备就绪，点击「开始安装」一键部署 OpenClaw");
  
  document.getElementById("quick-save-btn")?.addEventListener("click", async () => {
    const provider = (document.getElementById("quick-provider") as HTMLSelectElement)?.value;
    const apiKey = (document.getElementById("quick-api-key") as HTMLInputElement)?.value;
    
    if (!apiKey) {
      log("请输入 API Key", "error");
      return;
    }
    
    try {
      log("保存配置...");
      const homeResult = await invoke<string>("run_command", { cmd: `echo $HOME` });
      const homeDir = homeResult.trim();
      const configFile = homeDir + "/.openclaw/openclaw.json";
      
      const providerData = providerModels[provider] || { url: "", models: [], providerKey: provider };
      const tokenResult = await invoke<string>("run_command", { cmd: `openssl rand -hex 16` });
      const token = tokenResult.trim();
      
      // Model ID - some already contain provider prefix (e.g., moonshot/kimi-k2.5)
      const modelId = providerData.models[0].includes("/") 
        ? providerData.models[0] 
        : `${providerData.providerKey}/${providerData.models[0]}`;
      
      // Update openclaw.json (gateway config only)
      const openclawConfig = {
        gateway: { 
          mode: "local", 
          auth: { token },
          http: {
            endpoints: {
              chatCompletions: { enabled: true }
            }
          }
        },
        agents: {
          defaults: {
            model: modelId
          }
        }
      };
      
      await invoke<string>("run_command", { cmd: `mkdir -p "${homeDir}/.openclaw"` });
      await invoke<string>("run_command", { cmd: `echo '${JSON.stringify(openclawConfig, null, 2)}' > "${configFile}"` });
      
      // Update models.json with correct format (use providerKey for provider name)
      await invoke<string>("run_command", { cmd: `mkdir -p "${homeDir}/.openclaw/agents/main/agent"` });
      const modelsJson = JSON.stringify({
        providers: {
          [providerData.providerKey]: {
            apiKey: apiKey,
            baseUrl: providerData.url,
            api: "openai-completions",
            models: providerData.models.slice(0, 3).map((m: string) => ({ id: m, name: m, input: ["text"], contextWindow: 195000 }))
          }
        }
      }, null, 2);
      await invoke<string>("run_command", { cmd: `echo '${modelsJson}' > "${homeDir}/.openclaw/agents/main/agent/models.json"` });
      
      // Update auth-profiles.json (use providerKey for provider name)
      const authJson = JSON.stringify({
        version: 1,
        profiles: {
          [providerData.providerKey]: {
            type: "api_key",
            provider: providerData.providerKey,
            key: apiKey
          }
        }
      }, null, 2);
      await invoke<string>("run_command", { cmd: `echo '${authJson}' > "${homeDir}/.openclaw/agents/main/agent/auth-profiles.json"` });
      
      log("✓ 配置已保存", "success");
      log("重启网关...");
      
      const dir = await invoke<string>("get_install_dir");
      const binDir = `${dir}/node/${getNodeExtractDir()}/bin`;
      
      // Kill existing gateway processes
      await invoke("run_command_with_env", { cmd: "pkill -f 'openclaw-gateway' || true", nodePath: binDir });
      await new Promise(r => setTimeout(r, 2000));
      await invoke("run_command_with_env", { cmd: "pkill -f 'run-node.mjs gateway' || true", nodePath: binDir });
      await new Promise(r => setTimeout(r, 2000));
      
      // Start gateway
      await invoke("run_command_background", { cmd: `cd "${dir}/openclaw" && node scripts/run-node.mjs gateway --raw-stream --raw-stream-path=/tmp/openclaw-stream.jsonl`, nodePath: binDir });
      
      // 等待 Gateway 启动
      log("等待网关启动...");
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const check = await invoke<string>("run_command", { cmd: `lsof -i :18789` });
          if (check && check.includes("node")) {
            log("✓ 网关已启动", "success");
            break;
          }
        } catch {}
        log("等待中... " + (i + 1) * 2 + "秒");
      }
      
      log(`Dashboard: http://127.0.0.1:18789/#token=${token}`);
      
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(`http://127.0.0.1:18789/#token=${token}`);
    } catch(e) {
      log("失败: " + e, "error");
    }
  });
});
