<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Release / 本地替换流程

当用户要求“推送 repo / 打包 release / 替换本地 app”时，按下面流程执行，默认发布 patch 版本：

1. 确认工作区状态：
   - `git status --short`
   - `git log --oneline origin/main..HEAD`
2. 版本号同步更新：
   - `package.json`
   - `package-lock.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock`
3. 运行验证：
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - `NEXT_OUTPUT=export npm run build`
   - `npm run tauri:build`
4. 提交并打 tag：
   - `git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock`
   - `git commit -m "chore: release vX.Y.Z"`
   - `git tag -a vX.Y.Z -m "Pomotree vX.Y.Z"`
5. 打包 GitHub release 附件：
   - App 产物：`/Users/maple/Documents/Pomotree/src-tauri/target/release/bundle/macos/Pomotree.app`
   - Zip 路径：`/tmp/Pomotree-vX.Y.Z-macos.zip`
   - 命令：`ditto -c -k --sequesterRsrc --keepParent src-tauri/target/release/bundle/macos/Pomotree.app /tmp/Pomotree-vX.Y.Z-macos.zip`
   - 记录校验：`shasum -a 256 /tmp/Pomotree-vX.Y.Z-macos.zip`
6. 推送：
   - `git push origin main`
   - `git push origin vX.Y.Z`
7. 创建 GitHub release：
   - `gh release create vX.Y.Z /tmp/Pomotree-vX.Y.Z-macos.zip --title "Pomotree vX.Y.Z" --notes "<release notes>" --latest`
   - 用 `gh release view vX.Y.Z --json tagName,name,url,isDraft,isPrerelease,publishedAt,assets` 验证附件上传成功。
8. 替换本地 `/Applications` 里的旧 app：
   - 如正在运行，先退出：`osascript -e 'tell application "Pomotree" to quit' || true`
   - 必要时结束进程：`pkill -x Pomotree || true`
   - `rm -rf /Applications/Pomotree.app`
   - `ditto /Users/maple/Documents/Pomotree/src-tauri/target/release/bundle/macos/Pomotree.app /Applications/Pomotree.app`
   - `xattr -dr com.apple.quarantine /Applications/Pomotree.app 2>/dev/null || true`
   - 验证版本：`/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' /Applications/Pomotree.app/Contents/Info.plist`

注意：
- Release zip 不要提交到 git，优先放 `/tmp`。
- 若 `Cargo.lock` 被手动改坏，先检查 `[[package]] name = "pomotree"` 下的 `version` 是否只有一组引号。
- 完成后确认：`git status --short` 为空，`git rev-list --left-right --count origin/main...HEAD` 为 `0 0`。
