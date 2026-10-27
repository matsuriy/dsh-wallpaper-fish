# dsh-wallpaper-fish（大肥鱼版）🐟

DeepSeek Harness (DSH) 动态壁纸皮肤插件：把应用背景换成**静音循环视频（mp4/webm）**或**图片（jpg/png/gif）**，在 **设置 → 壁纸 / Wallpaper** 里配置，即改即生效，无需重启。

> 基于 [ddbj-hub/dsh-wallpaper-skin](https://github.com/ddbj-hub/dsh-wallpaper-skin) 深度改造。原版依赖宿主 settings 服务与 ctx.fs 沙箱，在新版 DSH 上无法保存、无法读取 profile 外的文件；本版改为**自管 JSON 配置 + node:fs 直读**，修复了路由被代理拦截、启动时序竞争、热切换缓存等一系列兼容性问题。

## ✨ 功能

- 🎬 **视频壁纸**：mp4 / webm / mov，静音循环，Range 流式播放（4K 无压力）
- 🖼️ **图片壁纸**：jpg / png / webp / gif（动图会动）
- ⚙️ **设置页集成**：在 DSH「设置」侧栏新增 **壁纸 / Wallpaper** 页
  - 路径输入 + **Windows 原生文件选择框**（带媒体类型筛选）
  - 内容遮罩滑条（0%~60%，控制壁纸上的调色膜浓度）
  - 壁纸亮度滑条（40%~140%，原地生效、不闪烁）
  - 底调颜色：深色 / 浅色（浅色模式会让整个界面变亮，白雾玻璃感）
  - 填充方式：裁剪填满 / 完整显示（WE 式模糊垫底）/ 拉伸铺满
  - 诊断按钮：一键上报页面背景层信息
- 🧹 **清场扫描**：自动隐藏其他皮肤残留的全屏壁纸层（防抢戏、防糊）
- 🖥️ **兜底**：若宿主不提供 slots 服务，自动降级为右下角 🎨 悬浮面板
- 🌓 深色/浅色主题自适应

## 📦 安装

### 方式一：一键脚本（本机 / 局域网分发）

```powershell
# 在插件目录里执行；DSH_HOME 默认 %DSH_HOME%，否则 F:\tool\deepseek-harness\dsh-data
powershell -ExecutionPolicy Bypass -File .\install.ps1
# 指定其他 DSH 数据目录：
powershell -ExecutionPolicy Bypass -File .\install.ps1 -DshHome 'D:\dsh-data'
```

脚本自动完成：安装依赖到 profile → 写入 cordis.patch.yml 补丁行 → 提示重启。

### 方式二：从 GitHub 直接安装

```powershell
$profile = "$env:DSH_HOME\profiles\desktop"
$pnpm = "$env:DSH_HOME\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
node $pnpm --dir $profile remove dsh-wallpaper-fish
node $pnpm --dir $profile add github:matsuriy/dsh-wallpaper-fish
```

然后在 `$profile\cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: dsh-wallpaper-fish
      name: dsh-wallpaper-fish
      config:
        path: C:/path/to/your/default-wallpaper.mp4
```

### 方式三：npm（发布后）

```powershell
node $pnpm --dir $profile add dsh-wallpaper-fish
```

> 安装后**重启一次 DeepSeek Harness** 生效（仅首次）。

## ♻️ 卸载 / 急救禁用

```powershell
# 若插件导致启动失败，用这个一键禁用
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Disable
```

或手动：`node $pnpm --dir $profile remove dsh-wallpaper-fish`，并删除 `cordis.patch.yml` 里对应的 insert 行。

## ⚙️ 配置存储

- 壁纸路径：`%DSH_HOME%\wallpaper-skin.config.json`（也可在 `cordis.patch.yml` 的 `config.path` 里给默认值）
- 界面偏好（遮罩/亮度/底调/填充方式）：浏览器 localStorage

## 🧰 与原版的差异（技术向）

| 问题 | 原版 | 本版 |
|---|---|---|
| 路径保存依赖宿主 settings 服务 | 新版 DSH 对第三方不开放，报 `No configurable plugin entry` | 自管 JSON 配置文件 |
| ctx.fs 沙箱读不了 profile 外文件 | 视频 404 | node:fs 直读任意路径 |
| GET 路由被外层代理 400 | 面板轮询失败 | 路由改名 `/wps-state`、`/wps-bytes` |
| 热切换同 URL 命中浏览器缓存 | 换壁纸要重启 | 媒体 URL 带文件指纹 |
| 其他皮肤残留壁纸层抢戏/带 blur | 无处理 | 清场扫描自动隐藏 |
| slots 服务启动时序竞争 | 无处理 | 500ms 轮询等待，最长 20s |
| 插件重复激活导致定时器堆叠 | 无处理 | 单例守卫 |
| 配置界面 | 右下角悬浮面板 | 设置页（React slots），悬浮面板作兜底 |
| 选择文件 | 手输路径 | Windows 原生文件对话框 |

## 🖥️ 接口一览（宿主侧）

| 路由 | 说明 |
|---|---|
| `GET /wps-state` | 当前壁纸路径 / 类型 / 带指纹的媒体 URL |
| `POST /wps-state` | 保存路径 `{path}` 或重置 `{reset:true}` |
| `GET /wps-bytes` | 媒体字节流（支持 Range，视频拖动进度条的关键） |
| `GET /wps-browse?dir=` | 目录浏览（兼容旧版悬浮面板） |
| `GET /wps-pick` | 拉起 Windows 原生文件选择框，返回所选路径 |
| `GET /wallpaper-skin-debug?e=` | 调试事件环（排障用） |

## 🧪 已知限制

- 亮度/遮罩/底调基于 CSS 与图层叠加，不同 DSH 皮肤版本的类名漂移时以「调色膜」方案兜底
- 视频建议 < 50MB；超大 4K 视频首次加载略慢
- 原生文件选择框依赖 Windows PowerShell（`System.Windows.Forms`）

## 许可证

MIT（继承原版）
