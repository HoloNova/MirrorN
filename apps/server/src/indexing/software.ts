import type { Software } from '../db/installers.js';

/** 软件身份及审核的目录入口，不包含版本、文件清单或下载URL。 */
export const SOFTWARE: Software[] = [
  {
    slug: 'nodejs',
    resourceKey: 'nodejs-release',
    name: 'Node.js',
    aliases: ['node', 'nodejs', 'javascript', 'js'],
    category: 'language',
    repo: 'nodejs-release',
    tutorialId: 'nodejs',
  },
  {
    slug: 'anaconda-installer',
    resourceKey: 'anaconda',
    name: 'Miniconda（Python）',
    aliases: ['miniconda', 'python', 'conda'],
    category: 'language',
    repo: 'anaconda',
    tutorialId: 'miniconda',
  },
  {
    slug: 'anaconda-distribution',
    resourceKey: 'anaconda-distribution',
    name: 'Anaconda（Python）',
    aliases: ['anaconda', 'python', 'conda'],
    category: 'language',
    repo: 'anaconda',
  },
  {
    slug: 'r-cran',
    resourceKey: 'CRAN',
    name: 'R',
    aliases: ['r', 'cran', 'r语言'],
    category: 'language',
    repo: 'CRAN',
  },
];
