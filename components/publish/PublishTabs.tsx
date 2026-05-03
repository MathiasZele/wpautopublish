'use client';

import { useState } from 'react';
import { Zap, Sparkles, FileText } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
    <Tabs value={tab} onValueChange={(v) => setTab(v as 'ai' | 'direct' | 'auto')}>
      <TabsList>
        <TabsTrigger value="ai">
          <Sparkles className="h-3.5 w-3.5" /> Génération AI
        </TabsTrigger>
        <TabsTrigger value="direct">
          <FileText className="h-3.5 w-3.5" /> Contenu direct
        </TabsTrigger>
        <TabsTrigger value="auto">
          <Zap className="h-3.5 w-3.5" /> Lot automatique
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ai">
        <ManualPublishForm sites={sites} />
      </TabsContent>
      <TabsContent value="direct">
        <DirectPublishForm sites={sites} />
      </TabsContent>
      <TabsContent value="auto">
        <AutoRunForm sites={sites} />
      </TabsContent>
    </Tabs>
  );
}
