'use client';

import { useState } from 'react';
import { Send, Zap, Sparkles, FileText } from 'lucide-react';
import { ManualPublishForm } from './ManualPublishForm';
import { AutoRunForm } from './AutoRunForm';
import { DirectPublishForm } from './DirectPublishForm';

export interface PublishSite {
  id: string;
  name: string;
  url: string;
  hasNewsQuery: boolean;
  hasTopics: boolean;
  defaultCategoryIds: number[];
}

export function PublishTabs({ sites }: { sites: PublishSite[] }) {
  const [tab, setTab] = useState<'ai' | 'direct' | 'auto'>('ai');

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-xl p-1 inline-flex flex-wrap">
        <button
          onClick={() => setTab('ai')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'ai' ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Sparkles size={14} /> Génération AI
        </button>
        <button
          onClick={() => setTab('direct')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'direct' ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <FileText size={14} /> Contenu Direct
        </button>
        <button
          onClick={() => setTab('auto')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'auto' ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Zap size={14} /> Lot automatique
        </button>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {tab === 'ai' && <ManualPublishForm sites={sites} />}
        {tab === 'direct' && <DirectPublishForm sites={sites} />}
        {tab === 'auto' && <AutoRunForm sites={sites} />}
      </div>
    </div>
  );
}
