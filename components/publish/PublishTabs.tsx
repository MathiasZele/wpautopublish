'use client';

import { useState } from 'react';
import { Send, Zap, Sparkles, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { ManualPublishForm } from './ManualPublishForm';
import { AutoRunForm } from './AutoRunForm';

export interface PublishSite {
  id: string;
  name: string;
  url: string;
  hasNewsQuery: boolean;
  hasTopics: boolean;
  defaultCategoryIds: number[];
}

export function PublishTabs({ sites }: { sites: PublishSite[] }) {
  const [tab, setTab] = useState<'manual' | 'auto'>('manual');

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-xl p-1 inline-flex">
        <button
          onClick={() => setTab('manual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'manual' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Send size={14} /> Publication manuelle
        </button>
        <button
          onClick={() => setTab('auto')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'auto' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Zap size={14} /> Lot automatique
        </button>
      </div>

      {tab === 'manual' && <ManualPublishForm sites={sites} />}
      {tab === 'auto' && <AutoRunForm sites={sites} />}
    </div>
  );
}
