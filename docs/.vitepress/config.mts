import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'ja',
  title: 'Iceberg 学習ハンズオン',
  description: 'データ基盤の経験者が、Icebergを使った設計・運用に参画できるようになるための教材',
  cleanUrls: true,
  themeConfig: {
    nav: [{ text: '教材', link: '/guide/00-introduction' }],
    sidebar: [
      {
        text: '教材',
        items: [
          { text: 'はじめに', link: '/guide/00-introduction' },
          { text: '第1話　月曜の朝、先月の1件を直してと言われた', link: '/guide/01-monday-morning' },
          { text: 'よくある疑問', link: '/guide/faq' },
        ],
      },
    ],
    outline: { level: [2, 3], label: 'このページの内容' },
    docFooter: { prev: '前へ', next: '次へ' },
    search: { provider: 'local' },
  },
})
