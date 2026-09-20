import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'RAG 知识库问答',
  description: '上传私有文档，基于资料带引用、不瞎编地问答',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
