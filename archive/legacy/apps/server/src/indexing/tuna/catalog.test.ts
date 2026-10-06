import { describe, expect, it, vi } from 'vitest';
import { indexFixture } from '../../db/indexFixture.js';
import { queryFiles } from '../../db/fileQueries.js';
import { createApp } from '../../app.js';
import { loadDownloadRules } from '../rules/load.js';
import { SourceClient } from '../source.js';
import { executeInstallerJob, type InstallerJob } from '../installers.js';
import { parseTunaCatalog, TUNA_CATALOG_URL } from './catalog.js';

const rules = loadDownloadRules();
const row = (distro: string, name: string, url: string, category = 'app') => ({
  distro,
  category,
  urls: [{ name, url }],
});
const sample = [
  row('Python', '3.14.8 (Windows, amd64)', '/python/3.14.8/python-3.14.8-amd64.exe'),
  row(
    'Git',
    'Git 2.56.0 (64-bit, exe)',
    '/github-release/git-for-windows/git/LatestRelease/Git-2.56.0-64-bit.exe',
  ),
  row(
    'OBS',
    'OBS-Studio-32.2.2-Windows-x64-Installer (exe)',
    '/github-release/obsproject/obs-studio/OBS Studio 32.2.2/OBS-Studio-32.2.2-Windows-x64-Installer.exe',
  ),
  row(
    'OBS',
    'OBS-Studio-32.2.2-Windows-x64-PDBs (zip)',
    '/github-release/obsproject/obs-studio/OBS Studio 32.2.2/OBS-Studio-32.2.2-Windows-x64-PDBs.zip',
  ),
  row(
    'Ubuntu',
    '26.04.1 (arm64, Server)',
    '/ubuntu-cdimage/ubuntu/releases/resolute/release/ubuntu-26.04.1-live-server-arm64.iso',
    'os',
  ),
  row(
    'Conda',
    'Miniconda3-latest (Linux/x86_64, sh)',
    '/anaconda/miniconda/Miniconda3-latest-Linux-x86_64.sh',
  ),
  row(
    'Conda',
    'Anaconda3 2026.07-1 (Linux/x86_64, sh)',
    '/anaconda/archive/Anaconda3-2026.07-1-Linux-x86_64.sh',
  ),
  row(
    'miniforge',
    'latest (Linux-x86_64, sh)',
    '/github-release/conda-forge/miniforge/LatestRelease/Miniforge3-Linux-x86_64.sh',
  ),
  row(
    'Minikube',
    'minikube_v1.39.0_sbom.spdx',
    '/github-release/kubernetes/minikube/LatestRelease/minikube_v1.39.0_sbom.spdx',
  ),
  row(
    'Adobe Source',
    'SourceSans3-Regular (otf)',
    '/adobe-fonts/source-sans-pro/OTF/SourceSans3-Regular.otf',
    'font',
  ),
  row('F-Droid', '2000051 (Android, apk)', '/fdroid/repo/org.fdroid.fdroid_2000051.apk'),
];

describe('清华官方JSON清洗', () => {
  it('直接得到跨平台下载，拆分Conda并排除调试符号、SBOM和范围外资源', () => {
    const parsed = parseTunaCatalog(sample, rules);
    expect(parsed.downloads).toHaveLength(7);
    expect(parsed.downloads.find((d) => d.software === 'python')?.download).toMatchObject({
      version: '3.14.8',
      platform: 'windows',
      arch: 'x64',
      format: 'exe',
    });
    expect(parsed.downloads.find((d) => d.software === 'ubuntu')?.download).toMatchObject({
      version: '26.04.1',
      platform: 'linux',
      arch: 'arm64',
      metadata: { purpose: 'system_image' },
    });
    expect(
      parsed.downloads.find((d) => d.software === 'anaconda-installer')?.download,
    ).toMatchObject({ version: 'latest', metadata: { versionKind: 'alias' } });
    expect(
      parsed.downloads.find((d) => d.software === 'anaconda-distribution')?.download.version,
    ).toBe('2026.07-1');
    expect(parsed.downloads.find((d) => d.software === 'miniforge')?.download.version).toBe(
      'latest',
    );
    expect(parsed.downloads.find((d) => d.software === 'obs')?.download.url).toContain(
      '/OBS%20Studio%2032.2.2/',
    );
    expect(parsed.stats.rejected).toBe(4);
  });
  it.each([
    [
      'Eclipse IDE',
      'scout 2026-09 (linux-gtk, x86_64)',
      '/eclipse/technology/epp/downloads/release/2026-09/R/eclipse-scout-2026-09-R-linux-gtk-x86_64.tar.gz',
      '2026-09',
      'linux',
      'x64',
    ],
    [
      'Linux Mint',
      'LMDE 7 (64bit, cinnamon)',
      '/linuxmint-cd/debian/lmde-7-cinnamon-64bit.iso',
      '7',
      'linux',
      'x64',
    ],
    [
      'TeX 排版系统',
      'TeX Live 2026 (Windows & Linux)',
      '/CTAN/systems/texlive/Images/texlive2026-20260301.iso',
      '2026',
      'windows',
      'unknown',
    ],
    [
      'Wireshark',
      'latest (x64, msi)',
      '/wireshark/win64/Wireshark-latest-x64.msi',
      'latest',
      'windows',
      'x64',
    ],
    [
      'Minikube',
      'minikube_latest_darwin_arm64.tar.gz',
      '/github-release/kubernetes/minikube/LatestRelease/minikube_latest_darwin_arm64.tar.gz',
      'latest',
      'macos',
      'arm64',
    ],
    [
      'NanaZip',
      '7.0, version 2609.2 (7.0.1843.0)',
      '/github-release/M2Team/NanaZip/NanaZip 7.0, version 2609.2 (7.0.1843.0)/NanaZipPreview_7.0.1843.0.msixbundle',
      '7.0.1843.0',
      'windows',
      'unknown',
    ],
    [
      'auth-thu',
      'auth-thu v2.4.0 (linux.x86_64)',
      '/github-release/z4yx/GoAuthing/v2.4.0/auth-thu.linux.x86_64',
      '2.4.0',
      'linux',
      'x64',
    ],
    [
      'auth-thu',
      'auth-thu v2.4.0 (linux.armv5)',
      '/github-release/z4yx/GoAuthing/v2.4.0/auth-thu.linux.armv5',
      '2.4.0',
      'linux',
      'armv5l',
    ],
    [
      'rust-analyzer',
      '2026-10-05 (macos, universal)',
      '/github-release/rust-analyzer/rust-analyzer/2026-10-05/rust-analyzer-universal-apple-darwin.gz',
      '2026-10-05',
      'macos',
      'universal',
    ],
    [
      'OBS',
      '32.2.2-beta1 (Windows)',
      '/github-release/obsproject/obs-studio/32.2.2-beta1/OBS-Studio-32.2.2-beta1-Windows-Installer.exe',
      '32.2.2-beta1',
      'windows',
      'unknown',
    ],
    [
      'Wireshark',
      'latest (Arm 64, dmg)',
      '/wireshark/osx/Wireshark Latest Arm 64.dmg',
      'latest',
      'macos',
      'arm64',
    ],
    [
      'Wireshark',
      'latest (Intel 64, dmg)',
      '/wireshark/osx/Wireshark Latest Intel 64.dmg',
      'latest',
      'macos',
      'x64',
    ],
    ['R', '3.6.3 (32-bit)', '/CRAN/bin/windows/base/R-3.6.3-win.exe', '3.6.3', 'windows', 'x86'],
    [
      'Atom',
      'atom-amd64.tar.gz',
      '/github-release/atom/atom/LatestRelease/atom-amd64.tar.gz',
      'latest',
      'linux',
      'x64',
    ],
    [
      'TeX 排版系统',
      '2.5.3 (cygwin)',
      '/lyx/bin/2.5.3/lyx-2.5.3-cygwin.tar.gz',
      '2.5.3',
      'windows',
      'unknown',
    ],
    [
      'RustDesk',
      '1.5.0 (x86_64, flatpak)',
      '/github-release/rustdesk/rustdesk/LatestRelease/rustdesk-1.5.0-x86_64.flatpak',
      '1.5.0',
      'linux',
      'x64',
    ],
  ])('真实命名变体：%s / %s', (group, name, url, version, platform, arch) => {
    const parsed = parseTunaCatalog([row(group, name, url)], rules);
    expect(parsed.downloads[0]?.download).toMatchObject({ version, platform, arch });
  });
  it('BSD包、许可归档、远程扩展宿主不是桌面安装下载，明确过滤而非待审', () => {
    const parsed = parseTunaCatalog(
      [
        sample[0],
        row(
          'Julia',
          '1.13.1 (freebsd/x64, tar.gz)',
          '/julia-releases/bin/freebsd/x64/1.13/julia-1.13.1-freebsd-x86_64.tar.gz',
        ),
        row(
          'Minikube',
          'licenses.tar.gz',
          '/github-release/kubernetes/minikube/LatestRelease/licenses.tar.gz',
        ),
        row(
          'VS Codium',
          'vscodium-reh-alpine-x64-1.135.06055.tar.gz',
          '/github-release/VSCodium/vscodium/LatestRelease/vscodium-reh-alpine-x64-1.135.06055.tar.gz',
        ),
      ],
      rules,
    );
    expect(parsed.downloads).toHaveLength(1);
    expect(parsed.stats.pending).toBe(0);
    expect(parsed.stats.rejected).toBe(3);
  });
  it.each([
    'https://evil.example/python.exe',
    '//evil.example/python.exe',
    '/python/../github-release/evil/python.exe',
    '/python/%2e%2e/github-release/evil.exe',
    '/python/a%2fb.exe',
    '/python/file.exe?q=1',
    '/python/file.exe#bad',
    '/python/%5cfile.exe',
    '/python/bad%00.exe',
    '/python/%7f.exe',
    '/python/file%zz.exe',
    '/python//file.exe',
  ])('拒绝异常URL：%s', (url) => {
    expect(() =>
      parseTunaCatalog([row('Python', '3.14.8 (Windows, amd64)', url)], rules),
    ).toThrow();
  });
  it.each([
    [],
    {},
    [{ distro: 'Python', category: 'app', urls: [] }],
    [row('Python', '', '/python/python.exe')],
  ])('不发布空或结构异常清单', (value) => {
    expect(() => parseTunaCatalog(value, rules)).toThrow();
  });
  it('LyX无明确二进制证据的归档不当作安装包', () => {
    const parsed = parseTunaCatalog(
      [sample[0], row('TeX 排版系统', '2.5.3 (Linux)', '/lyx/bin/2.5.3/lyx-2.5.3.tar.gz')],
      rules,
    );
    expect(parsed.issues[0]?.reason).toBe('unverified_archive');
    expect(parsed.downloads).toHaveLength(1);
  });
  it('同站绝对URL与相对URL去重，缺失平台或版本不猜测并进入待审', () => {
    const parsed = parseTunaCatalog(
      [
        sample[0],
        row(
          'Python',
          '3.14.8 (Windows, amd64)',
          'https://mirrors.tuna.tsinghua.edu.cn/python/3.14.8/python-3.14.8-amd64.exe',
        ),
        row('Python', 'Python (Windows)', '/python/python.exe'),
        row(
          'VS Codium',
          '1.135.06055',
          '/github-release/VSCodium/vscodium/1.135.06055/portable-1.135.06055.zip',
        ),
      ],
      rules,
    );
    expect(parsed.downloads).toHaveLength(1);
    expect(parsed.stats.duplicates).toBe(1);
    expect(parsed.issues.map((issue) => issue.reason).sort()).toEqual([
      'unrecognized_platform',
      'unrecognized_version',
    ]);
  });
  it('重复URL去重，未知软件进入有限待审统计，不猜测软件身份', () => {
    const parsed = parseTunaCatalog(
      [
        sample[0],
        sample[0],
        row('Unknown App', '1.0.0 (Windows)', '/github-release/unknown/app/1.0.0/setup.exe'),
      ],
      rules,
    );
    expect(parsed.downloads).toHaveLength(1);
    expect(parsed.stats.duplicates).toBe(1);
    expect(parsed.stats.pending).toBe(1);
  });
});

describe('官方JSON经后台写入SQLite，现有API只读展示', () => {
  it('刷新会派发官方任务且只请求一次JSON，不逐文件联网', async () => {
    const db = indexFixture();
    try {
      const jobs: InstallerJob[] = [];
      await executeInstallerJob(
        db,
        { kind: 'refresh', ruleRevision: rules.revision },
        new SourceClient(vi.fn()),
        async (next) => {
          jobs.push(...next);
        },
        rules,
      );
      const job = jobs.find((j) => j.kind === 'official');
      expect(job).toBeDefined();
      const network = vi.fn<typeof fetch>(async () =>
        Response.json([
          ...sample,
          row('Unknown App', '1.0.0 (Windows)', '/github-release/unknown/app/1.0.0/setup.exe'),
        ]),
      );
      await executeInstallerJob(db, job!, new SourceClient(network), async () => {}, rules);
      expect(
        db
          .prepare(
            "SELECT COUNT(*) n FROM catalog_pending WHERE binding_id='tsinghua-official' AND reason='unadapted_software'",
          )
          .get(),
      ).toMatchObject({ n: 1 });
      expect(network).toHaveBeenCalledTimes(1);
      expect(String(network.mock.calls[0]![0])).toBe(TUNA_CATALOG_URL);
      expect(queryFiles(db, { resource: 'tsinghua:python' }).items).toHaveLength(1);
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          throw new Error('查询不应访问源站');
        }),
      );
      const app = createApp({ db });
      const response = await app.request('/api/catalog?q=python');
      expect(response.status).toBe(200);
      expect((await response.json()).items.some((r: { id: string }) => r.id === 'python')).toBe(
        true,
      );
      const site = await (await app.request('/api/catalog/sites/tsinghua')).json();
      expect(site.total).toBe(7);
    } finally {
      vi.unstubAllGlobals();
      db.close();
    }
  });
  it('任一软件批次触发骤减保护，整份清单原子回滚，不能留下半发布结果', async () => {
    const db = indexFixture();
    const job: InstallerJob = { kind: 'official', epoch: 1, ruleRevision: rules.revision };
    try {
      const python = Array.from({ length: 12 }, (_, index) =>
        row(
          'Python',
          `3.14.8 (Windows, ${index % 2 ? 'arm64' : 'amd64'})`,
          `/python/3.14.8/python-3.14.8-amd64-build${index}.exe`,
        ),
      );
      await executeInstallerJob(
        db,
        job,
        new SourceClient(async () => Response.json([...python, sample[1]])),
        async () => {},
        rules,
      );
      const newGit = row(
        'Git',
        'Git 2.57.0 (64-bit, exe)',
        '/github-release/git-for-windows/git/LatestRelease/Git-2.57.0-64-bit.exe',
      );
      await expect(
        executeInstallerJob(
          db,
          { ...job, epoch: 2 },
          new SourceClient(async () => Response.json([newGit, sample[0]])),
          async () => {},
          rules,
        ),
      ).rejects.toThrow('数量突降');
      expect(queryFiles(db, { resource: 'tsinghua:python' }).items.length).toBe(12);
      expect(queryFiles(db, { resource: 'tsinghua:git' }).items[0]?.version).toBe('2.56.0');
      expect(
        db.prepare("SELECT COUNT(*) n FROM catalog_runs WHERE state='failed'").get(),
      ).toMatchObject({ n: 2 });
    } finally {
      db.close();
    }
  });
  it('上游改变分组名而暂时无法识别的旧URL保留，有限待审样本可审计', async () => {
    const db = indexFixture();
    const job: InstallerJob = { kind: 'official', epoch: 1, ruleRevision: rules.revision };
    try {
      const oldFile = row(
        'Python',
        '3.13.0 (Windows, amd64)',
        '/python/3.13.0/python-3.13.0-amd64.exe',
      );
      await executeInstallerJob(
        db,
        job,
        new SourceClient(async () => Response.json([sample[0], oldFile])),
        async () => {},
        rules,
      );
      await executeInstallerJob(
        db,
        { ...job, epoch: 2 },
        new SourceClient(async () =>
          Response.json([sample[0], { ...oldFile, distro: 'Python Renamed' }]),
        ),
        async () => {},
        rules,
      );
      expect(queryFiles(db, { resource: 'tsinghua:python' }).items).toHaveLength(2);
      expect(
        db
          .prepare("SELECT COUNT(*) n FROM catalog_pending WHERE reason='unadapted_software'")
          .get(),
      ).toMatchObject({ n: 1 });
    } finally {
      db.close();
    }
  });
  it('失败、异常空和结构截断均保留上一轮下载，状态可审计', async () => {
    const db = indexFixture();
    const job: InstallerJob = { kind: 'official', epoch: 1, ruleRevision: rules.revision };
    try {
      await executeInstallerJob(
        db,
        job,
        new SourceClient(async () => Response.json(sample)),
        async () => {},
        rules,
      );
      for (const value of [[], {}, [row('Python', '', '/python/file.exe')]]) {
        await expect(
          executeInstallerJob(
            db,
            { ...job, epoch: 2 },
            new SourceClient(async () => Response.json(value)),
            async () => {},
            rules,
          ),
        ).rejects.toThrow();
        expect(queryFiles(db, { resource: 'tsinghua:python' }).items).toHaveLength(1);
      }
    } finally {
      db.close();
    }
  });
});
