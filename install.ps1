# dsh-wallpaper-fish 一键安装脚本（大肥鱼版）
# 安装：
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 [-DshHome <DSH 数据目录>] [-ProfileName desktop]
# 急救禁用（插件导致启动失败时）：
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Disable
param(
    [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { 'F:\tool\deepseek-harness\dsh-data' }),
    [string]$ProfileName = 'desktop',
    [switch]$Disable
)
$ErrorActionPreference = 'Stop'

$pluginDir = $PSScriptRoot
$profileDir = Join-Path $DshHome "profiles\$ProfileName"
$node = Join-Path $DshHome 'dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = Join-Path $DshHome 'dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'

if (-not (Test-Path $profileDir)) { Write-Error "找不到 profile 目录: $profileDir"; exit 1 }
if (-not (Test-Path $node)) {
    $node = 'node'
    $pnpm = 'pnpm'
    Write-Host '未找到内置 runtime，回退到系统 node/pnpm'
}

$patch = Join-Path $profileDir 'cordis.patch.yml'

function Remove-PluginPatch {
    if (-not (Test-Path $patch)) { return }
    $raw = Get-Content $patch -Raw -Encoding UTF8
    if ($raw -notmatch 'dsh-wallpaper-fish') { Write-Host '补丁里没有插件条目'; return }
    $parts = [regex]::Split($raw, '(?m)^(?=- )')
    $kept = @()
    foreach ($p in $parts) {
        if ($p -match 'dsh-wallpaper-fish') { continue }
        $kept += $p.TrimEnd("`r", "`n")
    }
    $new = ($kept -join "`n") -replace "(`n){3,}", "`n`n"
    Set-Content -Path $patch -Value $new -Encoding UTF8 -NoNewline
    Write-Host "已从 $patch 移除插件条目"
}

if ($Disable) {
    Remove-PluginPatch
    Write-Host '== 已禁用 dsh-wallpaper-fish，重启 DeepSeek Harness 即可正常启动 =='
    exit 0
}

Write-Host "== 1/3 安装插件到 $profileDir =="
& $node $pnpm --dir $profileDir remove dsh-wallpaper-fish 2>$null | Out-Null
& $node $pnpm --dir $profileDir add "file:$pluginDir"
if ($LASTEXITCODE -ne 0) { Write-Error 'pnpm add 失败'; exit 1 }

Write-Host "== 2/3 写入 cordis.patch.yml 补丁行 =="
$content = if (Test-Path $patch) { Get-Content $patch -Raw -Encoding UTF8 } else { '' }
if ($content -notmatch 'dsh-wallpaper-fish') {
    Add-Content -Path $patch -Encoding UTF8 -Value @'

- insert:
    - id: dsh-wallpaper-fish
      name: dsh-wallpaper-fish
'@
    Write-Host "已追加补丁行到 $patch"
} else {
    Write-Host '补丁行已存在，跳过'
}

Write-Host '== 3/3 完成 =='
Write-Host '重启 DeepSeek Harness 即可生效（仅首次需要）。'
Write-Host '若启动失败，运行：install.ps1 -Disable 恢复。'
