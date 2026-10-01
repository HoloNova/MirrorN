# 装好 Node.js 之后：验证、第一个程序与常见问题

Node.js 是一个在浏览器之外运行 JavaScript 的程序，官方把它叫 JavaScript 运行时。它自带包管理器 npm：官方文档写明，装 Node.js 的时候 npm 会一并装好，所以不需要再单独装一次 npm。

你手上的安装包来自镜像站的 Node.js 目录（本文以北大镜像的 `nodejs-release` 目录为例，文件名形如 `node-v<版本>-<平台>-<架构>.<后缀>`）。这类目录由镜像站自己同步，可能落后于官方当前版本，所以本页不写死某个「最新版本号」，而是告诉你确认自己装的是哪一版的方法。后面的顺序是：先看清自己下的是哪个文件，装的时候注意一两件事，装完在对的终端里验证，再跑起第一个程序；最后是 npm 与全局包的两个坑，以及卡住时怎么排查。以下命令都由你在自己的终端里执行。

你这次下载的是 `{{filename}}`（{{platform}} · {{version}}，由 {{site}} 提供）。下面按这个安装包往下走。

## 一、先看清你下的是哪个文件

文件名里有两段信息：平台（`win`、`darwin`、`linux`）和 CPU 架构（`x64`、`arm64`）。同一个版本目录里的文件按这两样分开打包，选法不一样：

- `.msi`（Windows）和 `.pkg`（macOS）是图形安装器，双击跟着向导走到结束就行；向导里如果有「Add to PATH」这类选项，保持默认勾选。
- `.zip`、`.7z`（Windows）与 `darwin-*.tar.gz`、`darwin-*.tar.xz`、`linux-*.tar.xz`（macOS、Linux）是免安装的压缩包，解压出来就是 Node 本体，但终端要认识 `node` 这个命令，还得你把解压目录里的 `bin` 加进 PATH，做法见下一节。
- Linux 没有图形安装器，官方给的就是压缩包。发行版的包管理器也能装 Node，但那是发行版维护的另一份东西，版本和文件位置都与官方安装包不同，本文不涉及。

先确认自己的架构再挑文件：Windows 看「设置 → 系统 → 关于 → 设备规格 → 系统类型」，写「基于 x64 的处理器」选 `x64`，写 ARM 的选 `arm64`；macOS 点苹果菜单 →「关于本机」，看「芯片」一行，Apple M 开头选 `arm64`，Intel 选 `x64`；Linux 在终端里运行 `uname -m`，`x86_64` 对应 `x64`，`aarch64` 对应 `arm64`。

同一个版本目录里还有几个容易下错的文件：

- 文件名里没有平台名的 `node-v<版本>.tar.gz`、`node-v<版本>.tar.xz` 是源码包，官方下载页把它们单独放在「Looking for Node.js source?」下面，新装的人不需要。
- `-headers.tar.gz` 是给要编译原生模块的人用的，普通使用不需要。
- 带 `musl` 的是给 Alpine 这类用 musl 而不是 glibc 的系统准备的：`ldd --version` 的输出里写着 musl 就选这种；不确定就先查官方文档，或者直接用官方下载页给自己系统推荐的那一个。
- 同一版本下的 `.tar.gz` 与 `.tar.xz` 是同一份内容的两种压缩，`.tar.xz` 体积更小，解压出来的东西一样。
- `SHASUMS256.txt` 是官方给的校验值清单，旁边还有 `.sig` 和 `.asc` 签名。想核对校验值，官方下载页上的「Learn how to verify signed SHASUMS」指向 Node.js 仓库 README 的 Verifying binaries 一节，步骤以那里为准。

## 二、安装

三个系统的差别主要在 PATH 由谁负责。

### Windows

`.msi`：双击，跟着向导点完；装完关掉所有已经开着的终端窗口，重新开一个。

`.zip` 或 `.7z`：解压到一个以后不会随手删掉的目录（比如 `C:\node`），再把这个目录加进系统 PATH。这一步没有安装器替你做，在「系统属性 → 环境变量」里给当前用户或整台机器加一条，各版本 Windows 的入口略有差异，具体以微软的官方说明为准。加完同样要新开终端。

### macOS

`.pkg`：双击，跟着 Installer 点「继续」到结束。它要往系统目录里写文件，过程中可能要求输入管理员密码；装完新开一个终端。

`.tar.gz` / `.tar.xz`：解压后自己处理 PATH，命令与下面 Linux 那段一样，把路径换成你自己解压出来的位置。

### Linux

把压缩包解压到固定位置，再把它的 `bin` 目录加进 PATH。下面以 x64 为例，文件名换成你实际下载到的那个：

```sh
tar -xJf node-v24.1.0-linux-x64.tar.xz    # 下的是 .tar.gz 就换成 -xzf
mv node-v24.1.0-linux-x64 ~/node
export PATH="$HOME/node/bin:$PATH"        # 只对当前这个终端窗口生效
node -v
```

想让每个新开的终端都生效，就把上面那行 `export PATH=...` 写进 shell 的启动文件（bash 是 `~/.bashrc`，zsh 是 `~/.zshrc`），然后重开终端。`~/node` 只是示例位置，换成你自己的目录。

### 同一台机器上只留你要用的那一份

装了不止一份 Node 时（比如系统自带一份，你又解压了一份官方压缩包），终端里用到的永远是 PATH 中排在前面那一份。要换成另一份就调整 PATH 顺序；系统自带的那份不要直接删，按发行版或系统的卸载方式处理。

## 三、在哪个终端里验证

最关键的一点：新开一个终端窗口。PATH 是终端启动时读到的，安装之前就开着的窗口不知道新路径，在里面敲命令会找不到——关掉重开就好。

```sh
node -v
npm -v
```

这两条正是 npm 官方文档给的检查命令，分别输出 Node.js 与 npm 自己的版本号，形如 `v24.1.0` 和另一串 npm 的版本号。两个版本号各发各的，不一一对应：npm 官方说 npm 发版比 Node.js 更频繁，所以在 Node.js 里想用最新稳定版 npm，要单独运行 `npm install npm@latest -g`。

再确认这个 `node` 到底是哪一份：

- macOS / Linux：`which node`。bash 里还可以用 `type -a node`，把 PATH 里所有同名的 `node` 都列出来。
- Windows：`where node`，它会列出找到的每一个。

输出应该指向你刚装的位置。如果指向 `/usr/bin/node` 这类系统路径，说明终端用的是另一份 Node，看第六节。

怎么看镜像站的版本落没落后：把镜像目录里最新那个版本目录的日期，和官方发布页对一下。本文写作于 2026 年 9 月，当时北大 `nodejs-release` 目录里最新的版本目录还是 2025 年 5 月的 v24.1.0，而官方同一时间的 LTS 已经到 v24.21.0；等镜像目录追上来，这段话就过期了，但比法不变——先看目录日期，再看官方发布页。

## 四、跑第一个程序

先跑一个最小的。建目录：

```sh
mkdir hello && cd hello
```

把下面这行存成 `hello.js`：

```js
console.log('你好，Node.js');
```

然后在**放着这个文件的目录里**运行：

```sh
node hello.js
```

终端会打印那一行文字。官方文档把这条最基本的用法写作 `node app.js`，并提醒你要在放着这个脚本的目录里运行。

想边改边看结果，加 `--watch`：

```sh
node --watch hello.js
```

官方文档的说法是这一项从 Node.js v16 起内建。如果它提示这个参数不认识，说明你这一版的情况不同，按提示加上实验参数，或先运行 `node --help` 看当前版本怎么写。

只想试几行 JavaScript、不想建文件，就直接运行 `node` 进 REPL：输入表达式回车看结果，`.exit` 退出（同一次里按两次 Ctrl+C 也行）。

接着可以跑官方的 Hello World 网页服务器：把下面这段存成 `server.js`，运行 `node server.js`，再用浏览器打开 `http://127.0.0.1:3000/`。这个程序会一直跑着，按 Ctrl+C 停：

```js
const { createServer } = require('node:http');

const server = createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello World');
});

server.listen(3000, '127.0.0.1', () => {
  console.log('Server running at http://127.0.0.1:3000/');
});
```

Windows 上有一个细节：官方那页提醒，cmd.exe 只认双引号，所以像 `node -e "console.log(123)"` 这种写法在命令提示符里要用双引号，在 PowerShell 或 Git Bash 里单双引号都可以。

## 五、npm 与全局包要注意什么

平时在项目里用的是本地安装：进项目目录运行 `npm install <包名>`，包会装进当前目录下的 `node_modules`，并按 `package.json` 记录版本；目录里还没有 `package.json` 的话，先运行 `npm init -y` 生成一个（`-y` 表示跳过那一串问询，直接给默认值）。

全局安装是另一回事：`npm install -g <包名>` 把包装到 npm 的全局目录里，位置由 prefix 决定。

- macOS / Linux：包在 `{prefix}/lib/node_modules`，可执行文件被链到 `{prefix}/bin`。
- Windows：包在 `{prefix}/node_modules`，可执行文件直接放在 `{prefix}`。
- prefix 的默认值：多数系统是 `/usr/local`，Windows 是 `%AppData%\npm`。查当前值用 `npm prefix -g`。

全局安装最容易踩两个点：

- 装完敲命令却提示找不到。npm 官方文档在讲目录时专门写了一句：全局安装的可执行文件所在目录必须在终端的 PATH 里，才能直接输入名字运行。所以「命令找不到」通常是 PATH 里少了这个目录，而不是包没装上。顺便看装了哪些全局包：`npm ls -g --depth=0`（`global` 和 `depth` 都是 npm ls 文档里的选项）；不想留了就 `npm uninstall -g <包名>`。
- 报权限错误（`EACCES`）。别用 `sudo` 或管理员终端去绕。npm 官方的解释是：用 Node 安装器装出来的 npm 位于只有本地权限的目录里，这正是全局装包报权限错误的原因。官方给的两条路是：一是换成版本管理器（macOS / Linux 上用 nvm，Windows 上用 nvm-windows 之类）重新装 Node，这是官方推荐的做法；二是手动改 npm 的默认目录——运行 `npm config set prefix ~/.local`，在 `~/.profile` 里加一行 `PATH=~/.local/bin:$PATH`（用 zsh 的话还要在 `~/.zprofile` 里加 `source ~/.profile`），然后 `source ~/.profile`，最后仿照官方文档里的例子用 `npm install -g npm-check-updates` 试一次。官方明确说这一条不适用于 Windows。

偶尔才用一次的包不必全局装：`npx <包名>` 可以不安装直接运行，npm 官方从 npm 5.2 起就把 npx 推荐为替代全局命令的做法。

## 六、卡住时的排查

### `node: command not found`、「'node' 不是内部或外部命令」

按顺序看三件事：

1. 是不是新开的窗口。安装前就开着的终端不认新路径，关掉重开。
2. `which node`（macOS / Linux）或 `where node`（Windows）有没有输出。没有输出说明 PATH 里确实没有它——压缩包安装十有八九是没加 `bin` 目录，或者只加给了当前窗口（`export PATH=...` 那行只对当前窗口有效）。
3. 有输出但不是你装的那一份，比如 `/usr/bin/node`：说明 PATH 里系统那份排在前面。调整顺序，或者先用全路径验证自己那份能不能跑，例如 `~/node/bin/node -v`。

### 全局装的命令找不到

`npm install -g` 没报错、敲命令却找不到，通常是 npm 的全局可执行目录不在 PATH 里。先 `npm prefix -g` 看 prefix 落在哪里，再把 `{prefix}/bin`（Windows 上是 `{prefix}`）加进 PATH。这就是 npm 目录文档里那句「全局可执行文件所在目录必须在 PATH 里」的直接后果。

### 权限错误 `EACCES`

照第五节那条走：不要 sudo，改用版本管理器，或把 npm 的全局目录换到自己家目录。npm 官方另有一页 Common errors，按报错关键词列出常见问题（权限、磁盘空间、git、代理等），遇到看不懂的报错先去那页对一遍。

### 装的是新版本，终端里却是旧的

同一台机器上装了不止一份 Node 时，终端里用到的永远是 PATH 里排在前面的那一份。用 `which node` / `where node` 看现在用的是哪份；要换成另一份就调整 PATH 顺序。

### npm 自己的报错与版本

`npm -v` 与文档、教程里写的版本不一样是正常的：npm 的版本与 Node.js 的版本各自发布，官方给的升级办法是 `npm install npm@latest -g`，把 npm 升到最新稳定版。

## 这些说法的出处

- 下载文件类型、源码包与校验值：[下载页](https://nodejs.org/en/download)、[官方逐版本文件清单](https://nodejs.org/download/release/latest/)、[发布线与 LTS 状态](https://nodejs.org/en/about/previous-releases)、[Verifying binaries](https://github.com/nodejs/node#verifying-binaries)
- 验证安装、运行脚本、REPL 与输出：[Run Node.js scripts from the command line](https://nodejs.org/learn/command-line/run-nodejs-scripts-from-the-command-line)、[How to use the Node.js REPL](https://nodejs.org/learn/command-line/how-to-use-the-nodejs-repl)、[Output to the command line using Node.js](https://nodejs.org/learn/command-line/output-to-the-command-line-using-nodejs)、[Introduction to Node.js（Hello World 服务器）](https://nodejs.org/learn/getting-started/introduction-to-nodejs)
- npm 随 Node 安装、npm 版本节奏：[下载安装 Node.js 与 npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm/)、[关于 npm CLI 版本](https://docs.npmjs.com/about-npm-versions/)
- 本地与全局安装、目录、前缀、权限：[本地安装包](https://docs.npmjs.com/downloading-and-installing-packages-locally/)、[全局安装包](https://docs.npmjs.com/downloading-and-installing-packages-globally/)、[npm folders](https://docs.npmjs.com/cli/v12/configuring-npm/folders/)、[npm install](https://docs.npmjs.com/cli/v12/commands/npm-install/)、[npm init](https://docs.npmjs.com/cli/v12/commands/npm-init/)、[npm prefix](https://docs.npmjs.com/cli/v12/commands/npm-prefix/)、[npm ls](https://docs.npmjs.com/cli/v12/commands/npm-ls/)、[npm uninstall](https://docs.npmjs.com/cli/v12/commands/npm-uninstall/)、[npx](https://docs.npmjs.com/cli/v12/commands/npx/)、[EACCES 权限错误](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally/)、[Common errors](https://docs.npmjs.com/common-errors/)
- PATH 与环境变量：[PowerShell 环境变量说明（微软）](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_environment_variables)、[Windows 的 where（微软）](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/where)
- 解压与 shell 工具：[GNU tar 手册](https://www.gnu.org/software/tar/manual/tar.html)、[bash 的 type 内建](https://www.gnu.org/software/bash/manual/bash.html#Bourne-Shell-Builtins)
- 镜像目录本身：[北大 nodejs-release 目录（JSON）](https://mirrors.pku.edu.cn/files/nodejs-release/)
