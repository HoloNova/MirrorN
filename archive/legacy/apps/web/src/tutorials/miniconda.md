# 用 Miniconda 装出第一个 Python 环境

Miniconda 是 Anaconda 公司发布的最小安装包：里面只有 Python、包与环境管理器 conda，以及它们自己依赖的那几个包。它不自带 numpy、pandas 这类库，装什么由你之后用 `conda install` 决定。

你这次下载的是 `{{filename}}`（{{platform}} · {{version}}，由 {{site}} 提供）。下面按这个安装包往下走。

这一页的安装器放在北大镜像上。下载区会按你的系统和架构默认选中一个安装器，版本默认选本站列表里最新的那个；架构和版本都可以手动改成别的。流程是四步：先核对该下哪个文件，装好之后打开对的终端，确认 conda 能用，再建一个属于你的第一个环境。下面所有命令都由你复制到自己的终端里执行。

## 一、先确认自己的系统和架构

安装器是按「操作系统 + CPU 架构」分开打包的，下错了通常连装都装不上（Windows 会提示不兼容，macOS 会直接拒绝安装）。先花十秒确认这两件事：

- Windows：打开「设置 → 系统 → 关于」，看「设备规格 → 系统类型」。写着「基于 x64 的处理器」，就选文件名里带 `Windows-x86_64` 的 `.exe`。
- macOS：点左上角苹果菜单 →「关于本机」，看「芯片」一行。Apple M 开头（M1、M2 这类）选带 `MacOSX-arm64` 的文件；写着 Intel 的，选带 `MacOSX-x86_64` 的文件。
- Linux：在终端里运行 `uname -m`。输出 `x86_64` 选 `Linux-x86_64.sh`；输出 `aarch64`（ARM 服务器、部分树莓派）选 `Linux-aarch64.sh`。

官方当前的安装包只覆盖上面这几个架构。文件名里带 `x86`（32 位）、`ppc64le`、`s390x` 的，以及 Intel Mac 用的那几个文件，官方把它们列在「旧版本」清单里，只保留历史版本、不再更新。Intel Mac 就是一个具体例子：官方在 2025 年 8 月停止为 Intel Mac 构建安装包，镜像里那几个文件的日期也就停在那时候。

同一个架构下你会看到两种文件名，按需要挑：

- 带 `-latest-` 的（形如 `Miniconda3-latest-Linux-x86_64.sh`）是「当前版本」的固定名字，镜像同步之后会被换成更新的版本。
- 带版本号的（形如 `Miniconda3-py3<小版本>_<Miniconda 版本>-<构建号>-<平台>-<架构>`）指向一个固定版本，长期不变；要复现同一个版本、写脚本固定版本时用这种。
- 目录里还留着大量更早的文件，包括配套 Python 2 的 `Miniconda2-`。新装直接挑 `-latest-` 那一个，不必逐个比较日期。

装之前再确认系统本身够用：

- 磁盘至少留 400 MB：官方给的最小空间是下载加安装合计 400 MB，而安装器本身就有 100～200 MB。
- Linux：当前安装器要求 glibc 2.28 以上，CentOS 7、Ubuntu 18.04、Debian 9 这类系统用不了。另外 `Linux-aarch64` 的构建是按服务器级 ARM 芯片编译的，官方说明某些树莓派上可能跑不起来。
- Windows：官方列出的支持范围是 Windows 11 23H2 及更新；更早的系统已不在支持范围内，只能去官方归档里找旧安装器试试。

## 二、安装

三个系统的做法不一样，按你正在用的那个走。

### Windows

1. 双击下载到的 `.exe`。不要从「收藏夹」这类系统目录里启动它——那里权限特殊，官方记录过安装时报「Setup was unable to create the directory」这类错误；把它放到桌面或下载文件夹里再双击。
2. 看完许可协议，选「I Agree」。
3. 安装范围选 **Just Me (Recommended)**：只装给当前用户，不需要管理员权限。
4. 安装目录避开空格和特殊字符。
5. 选项页里不要勾「Add Miniconda3 to my PATH environment variable」。Anaconda 的文档在这一项上写了警告：那会把一堆包里的可执行文件永久写进系统 PATH，即使没激活任何环境也可能被别的软件用到，容易出问题。
6. 最后一项「Register Miniconda3 as my default Python」默认是勾上的，作用是让 VS Code、PyCharm 这类程序把这个 Python 当成默认解释器。
7. 装完点「Finish」，然后从开始菜单搜索并打开 **Anaconda Prompt**。

### macOS

两种安装器选一种即可。

用 `.pkg`（图形安装器）：

1. 双击 `.pkg`，跟着向导点「继续」、同意许可、安装。
2. 它会装到 `/opt/miniconda3`，并在安装结束时自动完成 conda 的初始化。

用 `.sh`（命令行安装器，适合想装进自己家目录的情况）。打开「终端」，运行下面这行，把文件名换成你实际下载到的那个：

```sh
bash ~/Downloads/<你下载到的文件名>
```

之后按这四步走完安装：

1. 按回车翻看许可协议，然后输入 `yes` 表示同意。
2. 直接回车，接受默认安装目录 `/Users/<你的用户名>/miniconda3`；想换位置就在这里输入另一个路径。
3. 安装器最后会问要不要运行 `conda init`，选 `yes`。它会往你的 shell 配置里加一段内容，让以后新开的终端都认得 `conda`。
4. 看到「Thank you for installing Miniconda3!」之后，关掉终端窗口再打开一次。

### Linux

把安装器下载到本地，然后在终端里运行，把文件名换成你实际下载到的那个：

```sh
bash ~/Downloads/<你下载到的文件名>
```

之后和 macOS 的 `.sh` 一样走两步：

1. 回车看许可 → 输入 `yes` 同意 → 回车接受默认目录 `~/miniconda3` → 问 `conda init` 时选 `yes`。
2. 关掉终端重开，或者按你用的 shell 刷新当前窗口：bash 用 `source ~/.bashrc`，zsh 用 `source ~/.zshrc`，fish 用 `exec fish`。

## 三、打开对的终端

这是最容易卡住的一步。conda 不是往系统里随便丢一个命令，而是靠改你的 shell 启动配置来生效的，所以在哪个窗口里敲命令很关键。

- Windows：从开始菜单搜索 **Anaconda Prompt** 并打开。这个窗口是安装器专门准备的，conda 一打开就能用，提示符前面显示 `(base)`。
- macOS / Linux：打开系统自带的「终端」。装完后第一次打开，提示符前面同样应该显示 `(base)`。
- 安装之前就已经开着的旧窗口不知道 conda 的存在，在里面敲命令会找不到——关掉重开就好。

提示符里的 `(base)` 表示你正处在 base 环境里。base 是 conda 自己的环境，日常写代码建议另建一个，见下一节。

## 四、确认 conda 能用

```sh
conda --version
```

输出一行版本号（形如 `conda <版本号>`），说明这个终端认得 conda 了。再看看 base 里装了哪些包：

```sh
conda list
```

能列出 `python`、`conda` 这些包，就说明安装本身是完整的。

## 五、建一个环境并激活它

每个 conda 环境是一个独立目录，各装各的 Python 和库，互不干扰。以后每个项目都可以建一个：某个项目把库升坏了，也影响不到别的项目。

创建环境。`myenv` 是环境名，可以自己取，后面命令里都用这个名字：

```sh
conda create --name myenv python
```

如果这是你第一次从 Anaconda 自己的频道装东西，它可能先问你是否接受 Anaconda 的服务条款。这是安装包里自带的 `conda-anaconda-tos` 插件在问（Miniconda 25.1-1-0 之后的安装包才带它）：输入 `a` 接受，输入 `v` 可以看条款内容，接受过一次就不会再问。之后才是常规的包清单和 `proceed ([y]/n)?` 确认，输入 `y` 回车。

想把 Python 固定在一个小版本上，就在 `python` 后面加等号和版本，写成 `python=3.<小版本>`；conda 还支持 `>=`、`<=`、`>`、`<` 这几种写法。不写版本号，就装当前能提供的最新 Python。

激活环境：

```sh
conda activate myenv
```

激活后，提示符前面的 `(base)` 会变成 `(myenv)`。

确认现在用的 Python 是环境里的那一个：

```sh
python --version
```

再确认它来自哪个路径。macOS / Linux：

```sh
which python
```

Windows（在 Anaconda Prompt 里）：

```sh
where python
```

输出的路径应该落在 `envs/myenv` 里面，形如 `~/miniconda3/envs/myenv/bin/python`，Windows 上是 `C:\Users\<你的用户名>\miniconda3\envs\myenv\python.exe`。路径里带 `envs/myenv` 就对了；如果指向系统自带的 Python，说明环境没有激活成功。

想看自己一共有哪些环境：

```sh
conda info --envs
```

每一行是一个环境，当前激活的那个前面带 `*`。

## 六、退出环境

```sh
conda deactivate
```

提示符从 `(myenv)` 退回 `(base)`。退出只是停止使用这个环境，环境本身还在磁盘上，下次 `conda activate myenv` 就能接着用。

## 七、命令找不到的处理

### `conda: command not found`（macOS / Linux）、「'conda' 不是内部或外部命令」（Windows）

原因通常是同一个：当前这个终端窗口没有加载 conda 的初始化。按顺序试：

1. 关掉窗口重开一个，并确认你现在登录的用户就是装 conda 的那个用户。
2. Windows：改用开始菜单里的 **Anaconda Prompt**。如果你更想在 PowerShell 或命令提示符里用 conda，先在能用的窗口里运行 `conda init`（Windows 上不带参数运行时，它默认给 cmd.exe 和 PowerShell 做初始化），再重开那个窗口。
3. macOS / Linux：如果安装时在「是否运行 conda init」那一步选了 `no`，你的 shell 配置从来没被改过，`conda` 就一直找不到。补救办法是运行 `~/miniconda3/bin/conda init`，如果你的安装目录不是默认的 `~/miniconda3` 就把它换成实际路径。运行完重开终端；不想重开就按你用的 shell 刷新当前窗口：zsh（macOS 默认）用 `source ~/.zshrc`，bash 用 `source ~/.bashrc`。
4. 还有一种可能是你用的 shell 不在 conda 支持的范围内。conda 目前能初始化的 shell 是 bash、zsh、fish、tcsh、xonsh、powershell。

### 提示符里没有 `(base)`，但 `conda` 命令能用

conda 有个开关叫 `auto_activate_base`。它被设成 `false` 时，新开的窗口不会自动激活 base 环境，但 `conda` 命令本身仍然可用。想回到 base，运行一次 `conda activate` 就行。想看这个开关当前的值：

```sh
conda config --describe auto_activate_base
```

## 这些说法的出处

- 各平台安装步骤与系统要求：[Miniconda 系统要求](https://www.anaconda.com/docs/getting-started/miniconda/system-requirements)、[macOS 图形安装器](https://www.anaconda.com/docs/getting-started/miniconda/install/mac-gui-install)、[macOS 命令行安装器](https://www.anaconda.com/docs/getting-started/miniconda/install/mac-cli-install)、[Windows 图形安装器](https://www.anaconda.com/docs/getting-started/miniconda/install/windows-gui-install)、[Linux 安装器](https://www.anaconda.com/docs/getting-started/miniconda/install/linux-install)、[架构与旧版本](https://www.anaconda.com/docs/getting-started/advanced-install/old-os)
- conda 命令、环境与服务条款插件：[环境管理](https://docs.conda.io/projects/conda/en/latest/user-guide/tasks/manage-environments.html)、[conda init](https://docs.conda.io/projects/conda/en/latest/commands/init.html)、[conda-anaconda-tos](https://www.anaconda.com/docs/getting-started/tos-plugin)
- 安装器文件清单：[北大镜像 miniconda 目录（JSON）](https://mirrors.pku.edu.cn/files/anaconda/miniconda/)
