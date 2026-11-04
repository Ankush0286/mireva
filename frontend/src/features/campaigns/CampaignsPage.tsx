import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  CalendarDays,
  Megaphone,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  RefreshCw,
  Trash2,
  Edit3,
  ExternalLink,
  X,
  Check,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Video,
  Ban,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  api,
  type Campaign,
  type ScheduledPost,
  type Account,
  type CampaignStatus,
  type PostStatus,
  type PostContentType,
  type PlatformType,
} from '../../api/client';
import { LoadingState } from '../../components/LoadingState';

// ============================================================================
// Platform & Status Badges Helpers
// ============================================================================

function PlatformBadge({ platform }: { platform: PlatformType }) {
  if (platform === 'twitter') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black text-white text-[10px] font-bold">
        <span>X / Twitter</span>
      </span>
    );
  }
  if (platform === 'instagram') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white text-[10px] font-bold">
        <span>Instagram</span>
      </span>
    );
  }
  if (platform === 'facebook') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1877F2] text-white text-[10px] font-bold">
        <span>Facebook</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
      <span>Gmail</span>
    </span>
  );
}

function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const styles: Record<CampaignStatus, string> = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    draft: 'bg-slate-100 text-slate-600 border-slate-200/60',
    paused: 'bg-amber-50 text-amber-700 border-amber-200/60',
    completed: 'bg-blue-50 text-blue-700 border-blue-200/60',
    archived: 'bg-purple-50 text-purple-700 border-purple-200/60',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${styles[status] || styles.draft}`}>
      {status}
    </span>
  );
}

function PostStatusBadge({ status }: { status: PostStatus }) {
  const styles: Record<PostStatus, { class: string; icon: React.ElementType }> = {
    scheduled: { class: 'bg-blue-50 text-blue-700 border-blue-200/60', icon: Clock },
    published: { class: 'bg-emerald-50 text-emerald-700 border-emerald-200/60', icon: CheckCircle2 },
    publishing: { class: 'bg-amber-50 text-amber-700 border-amber-200/60 animate-pulse', icon: Send },
    draft: { class: 'bg-slate-100 text-slate-600 border-slate-200/60', icon: FileText },
    failed: { class: 'bg-rose-50 text-rose-700 border-rose-200/60', icon: AlertTriangle },
    cancelled: { class: 'bg-slate-100 text-slate-400 border-slate-200/60', icon: Ban },
  };

  const current = styles[status] || styles.draft;
  const Icon = current.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${current.class}`}>
      <Icon size={10} />
      <span>{status}</span>
    </span>
  );
}

function ContentTypeIcon({ type }: { type: PostContentType }) {
  switch (type) {
    case 'image':
      return <ImageIcon size={13} className="text-purple-600" />;
    case 'video':
      return <Video size={13} className="text-blue-600" />;
    case 'carousel':
      return <Layers size={13} className="text-amber-600" />;
    default:
      return <FileText size={13} className="text-slate-500" />;
  }
}

interface CampaignsPageProps {
  initialView?: 'campaigns' | 'posts';
}

export const CampaignsPage: React.FC<CampaignsPageProps> = ({ initialView = 'campaigns' }) => {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'posts'>(initialView);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Toast System
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Custom Confirmation Dialog State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    subtext?: string;
    confirmText?: string;
    isDestructive?: boolean;
    onConfirm: () => Promise<void> | void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Filters
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [postStatusFilter, setPostStatusFilter] = useState<PostStatus | 'all'>('all');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<CampaignStatus | 'all'>('all');

  // Modals
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Campaign Form State
  const [campName, setCampName] = useState('');
  const [campDesc, setCampDesc] = useState('');
  const [campAudience, setCampAudience] = useState('');
  const [campStatus, setCampStatus] = useState<CampaignStatus>('active');
  const [campStartDate, setCampStartDate] = useState('');
  const [campEndDate, setCampEndDate] = useState('');
  const [campTagInput, setCampTagInput] = useState('');
  const [campTags, setCampTags] = useState<string[]>([]);

  // Post Form State
  const [postCampaignId, setPostCampaignId] = useState('');
  const [postAccountId, setPostAccountId] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postContentType, setPostContentType] = useState<PostContentType>('text');
  const [postMediaUrl, setPostMediaUrl] = useState('');
  const [postScheduledAt, setPostScheduledAt] = useState('');
  const [postIsDraft, setPostIsDraft] = useState(false);

  // Reusable refresh for user actions
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedCampaigns, fetchedAccounts] = await Promise.all([
        api.campaigns.list(),
        api.accounts.list(false),
      ]);

      setCampaigns(fetchedCampaigns);
      setAccounts(fetchedAccounts);

      const detailedCampaigns = await Promise.allSettled(
        fetchedCampaigns.map((c) => api.campaigns.get(c.id))
      );

      const allPosts: ScheduledPost[] = [];
      detailedCampaigns.forEach((res) => {
        if (res.status === 'fulfilled' && res.value.posts) {
          allPosts.push(...res.value.posts);
        }
      });

      allPosts.sort((a, b) => {
        const timeA = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const timeB = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        return timeB - timeA;
      });

      setPosts(allPosts);
    } catch (err: any) {
      setError(err?.message || 'Failed to load campaigns.');
    } finally {
      setLoading(false);
    }
  };

  // Mount effect (Zero synchronous setState calls in effect body)
  useEffect(() => {
    let isMounted = true;

    Promise.all([
      api.campaigns.list(),
      api.accounts.list(false),
    ])
      .then(async ([fetchedCampaigns, fetchedAccounts]) => {
        if (!isMounted) return;
        setCampaigns(fetchedCampaigns);
        setAccounts(fetchedAccounts);

        const detailed = await Promise.allSettled(
          fetchedCampaigns.map((c) => api.campaigns.get(c.id))
        );

        if (!isMounted) return;
        const allPosts: ScheduledPost[] = [];
        detailed.forEach((res) => {
          if (res.status === 'fulfilled' && res.value.posts) {
            allPosts.push(...res.value.posts);
          }
        });

        allPosts.sort((a, b) => {
          const timeA = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
          const timeB = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
          return timeB - timeA;
        });

        setPosts(allPosts);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err?.message || 'Failed to initialize campaigns.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const totalCampaigns = campaigns.length;
    const activeCampaigns = campaigns.filter((c) => c.status === 'active').length;
    const totalPosts = posts.length;
    const scheduledPosts = posts.filter((p) => p.status === 'scheduled').length;
    const publishedPosts = posts.filter((p) => p.status === 'published').length;
    const failedPosts = posts.filter((p) => p.status === 'failed').length;

    return { totalCampaigns, activeCampaigns, totalPosts, scheduledPosts, publishedPosts, failedPosts };
  }, [campaigns, posts]);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      return campaignStatusFilter === 'all' || c.status === campaignStatusFilter;
    });
  }, [campaigns, campaignStatusFilter]);

  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      const matchCampaign = campaignFilter === 'all' || p.campaign_id === campaignFilter;
      const matchStatus = postStatusFilter === 'all' || p.status === postStatusFilter;
      return matchCampaign && matchStatus;
    });
  }, [posts, campaignFilter, postStatusFilter]);

  const openCreateCampaignModal = () => {
    setEditingCampaign(null);
    setCampName('');
    setCampDesc('');
    setCampAudience('');
    setCampStatus('active');
    setCampStartDate('');
    setCampEndDate('');
    setCampTags([]);
    setFormError(null);
    setIsCampaignModalOpen(true);
  };

  const openEditCampaignModal = (c: Campaign) => {
    setEditingCampaign(c);
    setCampName(c.name);
    setCampDesc(c.description || '');
    setCampAudience(c.target_audience || '');
    setCampStatus(c.status);
    setCampStartDate(c.start_date ? c.start_date.slice(0, 10) : '');
    setCampEndDate(c.end_date ? c.end_date.slice(0, 10) : '');
    setCampTags(c.tags || []);
    setFormError(null);
    setIsCampaignModalOpen(true);
  };

  const openCreatePostModal = (defaultCampaignId?: string) => {
    setPostCampaignId(defaultCampaignId || (campaigns[0]?.id ?? ''));
    setPostAccountId(accounts[0]?.id ?? '');
    setPostContent('');
    setPostContentType('text');
    setPostMediaUrl('');

    const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const localIso = new Date(inTwoHours.getTime() - inTwoHours.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    setPostScheduledAt(localIso);
    setPostIsDraft(false);
    setFormError(null);
    setIsPostModalOpen(true);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campName.trim()) {
      setFormError('Please enter a campaign name.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      if (editingCampaign) {
        const updated = await api.campaigns.update(editingCampaign.id, {
          name: campName.trim(),
          description: campDesc.trim() || undefined,
          target_audience: campAudience.trim() || undefined,
          status: campStatus,
          start_date: campStartDate ? new Date(campStartDate).toISOString() : undefined,
          end_date: campEndDate ? new Date(campEndDate).toISOString() : undefined,
          tags: campTags,
        });
        setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        showToast(`Campaign "${updated.name}" updated.`);
      } else {
        const created = await api.campaigns.create({
          name: campName.trim(),
          description: campDesc.trim() || undefined,
          target_audience: campAudience.trim() || undefined,
          status: campStatus,
          start_date: campStartDate ? new Date(campStartDate).toISOString() : undefined,
          end_date: campEndDate ? new Date(campEndDate).toISOString() : undefined,
          tags: campTags,
        });
        setCampaigns((prev) => [created, ...prev]);
        showToast(`Campaign "${created.name}" created.`);
      }
      setIsCampaignModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save campaign.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSavePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postCampaignId || !postAccountId || !postContent.trim()) {
      setFormError('Please select a campaign, account, and enter your post copy.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const scheduledIso = !postIsDraft && postScheduledAt ? new Date(postScheduledAt).toISOString() : undefined;
      const mediaList = postMediaUrl.trim() ? [postMediaUrl.trim()] : [];

      const created = await api.campaigns.queuePost(postCampaignId, {
        account_id: postAccountId,
        content: postContent.trim(),
        content_type: mediaList.length > 0 ? (postContentType === 'text' ? 'image' : postContentType) : 'text',
        media_urls: mediaList,
        scheduled_at: scheduledIso,
        status: postIsDraft ? 'draft' : 'scheduled',
      });

      setPosts((prev) => [created, ...prev]);
      setIsPostModalOpen(false);
      showToast(postIsDraft ? 'Post saved as draft.' : 'Post scheduled successfully!');
    } catch (err: any) {
      setFormError(err?.message || 'Failed to queue post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Replaced window.confirm with Custom Confirm Modal
  const requestDeleteCampaign = (campaign: Campaign) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Campaign',
      message: `Are you sure you want to delete "${campaign.name}"?`,
      subtext: 'This will permanently remove the campaign and all of its associated scheduled posts.',
      confirmText: 'Delete Campaign',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.campaigns.delete(campaign.id);
          setCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
          setPosts((prev) => prev.filter((p) => p.campaign_id !== campaign.id));
          showToast(`Campaign "${campaign.name}" removed.`);
        } catch (err: any) {
          showToast(err?.message || 'Failed to delete campaign.', 'error');
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const requestDeletePost = (post: ScheduledPost) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Scheduled Post',
      message: 'Are you sure you want to permanently delete this post?',
      subtext: 'It will be removed from your queue and will not be dispatched.',
      confirmText: 'Delete Post',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.campaigns.deletePost(post.id);
          setPosts((prev) => prev.filter((p) => p.id !== post.id));
          showToast('Post deleted.');
        } catch (err: any) {
          showToast(err?.message || 'Failed to delete post.', 'error');
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const requestCancelPost = (post: ScheduledPost) => {
    setConfirmModal({
      isOpen: true,
      title: 'Cancel Post Delivery',
      message: 'Cancel this scheduled post?',
      subtext: 'The post will remain in your archive as cancelled and will not be published.',
      confirmText: 'Cancel Post',
      isDestructive: false,
      onConfirm: async () => {
        try {
          const updated = await api.campaigns.cancelPost(post.id);
          setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          showToast('Post cancelled.');
        } catch (err: any) {
          showToast(err?.message || 'Failed to cancel post.', 'error');
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const addTag = () => {
    const clean = campTagInput.trim().toLowerCase();
    if (clean && !campTags.includes(clean)) {
      setCampTags([...campTags, clean]);
      setCampTagInput('');
    }
  };

  return (
    <div className="relative h-full overflow-y-auto px-3 sm:px-6 py-4 custom-scrollbar max-w-6xl mx-auto w-full font-sans select-none text-[#09122A]">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl text-white text-xs font-semibold shadow-2xl animate-fade-up-1 ${
            toast.type === 'error' ? 'bg-rose-600' : 'bg-[#0E3A75]'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle size={15} /> : <Check size={15} className="text-emerald-400" strokeWidth={3} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 border border-[#DCE7F5] text-[11px] font-bold uppercase tracking-wider text-[#0E3A75] mb-2 shadow-2xs">
            <Megaphone size={11} />
            <span>Autonomous Content Engine</span>
          </div>
          <h1 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.025em] text-[#09122A] leading-tight">
            Campaigns{' '}
            <span className="relative inline-block font-serif italic font-normal text-[#0D2149]">
              & post queues
              <svg className="absolute -bottom-1.5 left-0 w-full h-3 text-amber-400 pointer-events-none" viewBox="0 0 160 14" fill="none">
                <path d="M3 10C45 4 115 3 157 8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="text-[13.5px] text-[#475569] mt-1">
            Plan multi-channel marketing campaigns, stage copy, and schedule automated post delivery.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button onClick={loadData} title="Refresh campaigns" className="w-9 h-9 rounded-xl bg-white border border-[#DCE7F5] hover:bg-slate-50 text-slate-600 flex items-center justify-center shadow-2xs cursor-pointer">
            <RefreshCw size={14} className={loading ? 'animate-spin text-[#0E3A75]' : ''} />
          </button>
          <button onClick={() => openCreatePostModal()} className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white border border-[#DCE7F5] hover:border-[#0E3A75] text-[#0E3A75] text-xs font-bold shadow-2xs transition-all hover:scale-[1.01] active:scale-95 cursor-pointer">
            <CalendarDays size={14} />
            <span>Queue Post</span>
          </button>
          <button onClick={openCreateCampaignModal} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-md transition-all hover:scale-[1.01] active:scale-95 cursor-pointer">
            <Plus size={15} strokeWidth={2.4} />
            <span>New Campaign</span>
          </button>
        </div>
      </div>

      {/* 2. KPI Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Active Campaigns</span>
          <div className="text-2xl font-bold text-[#09122A]">{stats.activeCampaigns} / {stats.totalCampaigns}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Targeting audiences</span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Scheduled Posts</span>
          <div className="text-2xl font-bold text-blue-700">{stats.scheduledPosts}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Awaiting dispatcher</span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Published</span>
          <div className="text-2xl font-bold text-emerald-700">{stats.publishedPosts}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Dispatched via adapters</span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Delivery Failures</span>
          <div className={`text-2xl font-bold ${stats.failedPosts > 0 ? 'text-rose-600' : 'text-slate-700'}`}>{stats.failedPosts}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Retries logged</span>
        </div>
      </div>

      {/* 3. Navigation View Switcher */}
      <div className="flex items-center justify-between mb-5 border-b border-[#E2ECF7] pb-3">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/80 border border-[#DCE7F5]">
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'campaigns' ? 'bg-[#EBF3FC] text-[#0E3A75] shadow-2xs' : 'text-slate-500 hover:text-[#09122A]'
            }`}
          >
            <Megaphone size={14} />
            <span>Campaigns ({campaigns.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'posts' ? 'bg-[#EBF3FC] text-[#0E3A75] shadow-2xs' : 'text-slate-500 hover:text-[#09122A]'
            }`}
          >
            <CalendarDays size={14} />
            <span>Content Queue ({posts.length})</span>
          </button>
        </div>

        {activeTab === 'campaigns' ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 hidden sm:inline">Status:</span>
            <select
              value={campaignStatusFilter}
              onChange={(e) => setCampaignStatusFilter(e.target.value as any)}
              className="h-8 px-2.5 rounded-xl bg-white border border-[#DCE7F5] text-xs font-semibold text-[#09122A] outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              className="h-8 px-2.5 rounded-xl bg-white border border-[#DCE7F5] text-xs font-semibold text-[#09122A] outline-none max-w-[160px] truncate"
            >
              <option value="all">All Campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <select
              value={postStatusFilter}
              onChange={(e) => setPostStatusFilter(e.target.value as any)}
              className="h-8 px-2.5 rounded-xl bg-white border border-[#DCE7F5] text-xs font-semibold text-[#09122A] outline-none"
            >
              <option value="all">All Posts</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle size={15} /><span>{error}</span>
        </div>
      )}

      {/* 4. Tab A: Campaigns Grid */}
      {activeTab === 'campaigns' && (
        <>
          {loading ? (
            <div className="py-20 flex justify-center"><LoadingState label="Loading marketing campaigns" variant="Orbit" /></div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-10 text-center shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center mx-auto mb-3"><Megaphone size={24} /></div>
              <h2 className="text-lg font-bold text-[#09122A]">No marketing campaigns created yet</h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                Group your scheduled posts, target audiences, and launch goals into organized initiatives.
              </p>
              <button onClick={openCreateCampaignModal} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer">
                <Plus size={14} /><span>Create First Campaign</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
              {filteredCampaigns.map((camp) => {
                const campaignPostCount = posts.filter((p) => p.campaign_id === camp.id).length;
                return (
                  <div key={camp.id} className="rounded-[22px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm flex flex-col justify-between hover:border-[#B8D0EC] transition-all">
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <CampaignStatusBadge status={camp.status} />
                            {camp.target_audience && (
                              <span className="text-[11px] font-semibold text-slate-400 truncate max-w-[200px]">
                                🎯 {camp.target_audience}
                              </span>
                            )}
                          </div>
                          <h3 className="text-[17px] font-bold text-[#09122A]">{camp.name}</h3>
                        </div>

                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditCampaignModal(camp)} className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer" title="Edit campaign">
                            <Edit3 size={13} />
                          </button>
                          <button onClick={() => requestDeleteCampaign(camp)} className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer" title="Delete campaign">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {camp.description && (
                        <p className="text-xs text-slate-600 mb-3 line-clamp-2 leading-relaxed">
                          {camp.description}
                        </p>
                      )}

                      {camp.tags && camp.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {camp.tags.map((t, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded-md bg-[#F1F6FC] text-[#0E3A75] font-mono text-[10.5px]">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3.5 border-t border-[#F0F5FA]">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg bg-[#EBF3FC] font-bold text-[11px] text-[#0E3A75]">
                          {campaignPostCount} {campaignPostCount === 1 ? 'Post' : 'Posts'}
                        </span>
                        {camp.start_date && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            {new Date(camp.start_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setCampaignFilter(camp.id);
                            setActiveTab('posts');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                        >
                          View Queue
                        </button>
                        <button
                          onClick={() => openCreatePostModal(camp.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-2xs cursor-pointer"
                        >
                          <Plus size={12} strokeWidth={2.5} />
                          <span>Queue Post</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 5. Tab B: Content Queue & Scheduled Posts */}
      {activeTab === 'posts' && (
        <>
          {loading ? (
            <div className="py-20 flex justify-center"><LoadingState label="Loading scheduled content" variant="Orbit" /></div>
          ) : filteredPosts.length === 0 ? (
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-10 text-center shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center mx-auto mb-3"><CalendarDays size={24} /></div>
              <h2 className="text-lg font-bold text-[#09122A]">No posts scheduled in this view</h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                Queue social content across your accounts and let the background worker dispatch posts automatically.
              </p>
              <button onClick={() => openCreatePostModal()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer">
                <CalendarDays size={14} /><span>Schedule A Post</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3 pb-8">
              {filteredPosts.map((post) => {
                const targetAccount = accounts.find((a) => a.id === post.account_id);
                const parentCampaign = campaigns.find((c) => c.id === post.campaign_id);

                return (
                  <div key={post.id} className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm hover:border-[#B8D0EC] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {targetAccount && <PlatformBadge platform={targetAccount.platform} />}
                        {targetAccount && (
                          <span className="text-xs font-bold text-[#09122A]">@{targetAccount.handle}</span>
                        )}
                        <span className="text-slate-300">•</span>
                        <span className="text-xs font-semibold text-slate-500 truncate max-w-[180px]">
                          {parentCampaign?.name || 'Campaign'}
                        </span>
                        <PostStatusBadge status={post.status} />
                        <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                          <ContentTypeIcon type={post.content_type} />
                          <span className="capitalize">{post.content_type}</span>
                        </div>
                      </div>

                      <p className="text-xs text-[#09122A] leading-relaxed whitespace-pre-wrap line-clamp-3 select-text bg-[#F8FAFD] p-2.5 rounded-xl border border-[#EBF2FA]">
                        {post.content}
                      </p>

                      {post.media_urls && post.media_urls.length > 0 && (
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-[#0E3A75] font-mono">
                          <ImageIcon size={12} />
                          <span className="truncate max-w-sm">{post.media_urls[0]}</span>
                        </div>
                      )}

                      {post.last_error_message && (
                        <div className="mt-2 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-1.5">
                          <AlertTriangle size={12} className="shrink-0" />
                          <span className="truncate">Error: {post.last_error_message} (Retries: {post.retry_count}/{post.max_retries})</span>
                        </div>
                      )}
                    </div>

                    <div className="flex md:flex-col items-center md:items-end justify-between shrink-0 gap-2.5 border-t md:border-t-0 pt-2 md:pt-0">
                      <div className="text-right">
                        <span className="block text-[11px] font-bold text-[#0E3A75] flex items-center gap-1">
                          <Clock size={12} />
                          {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Unscheduled Draft'}
                        </span>
                        {post.published_at && (
                          <span className="block text-[10px] text-emerald-600 font-mono mt-0.5">
                            Delivered {new Date(post.published_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {post.platform_post_url && (
                          <a href={post.platform_post_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors">
                            <span>View Post</span><ExternalLink size={11} />
                          </a>
                        )}

                        {post.status === 'scheduled' && (
                          <button onClick={() => requestCancelPost(post)} className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold cursor-pointer">
                            Cancel
                          </button>
                        )}

                        <button onClick={() => requestDeletePost(post)} className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer transition-colors" title="Delete post">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* CUSTOM CONFIRMATION MODAL (Replaces Ugly Native window.confirm)       */}
      {/* ===================================================================== */}
      {confirmModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          }}
        >
          <div className="w-full max-w-md rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl p-6 text-[#09122A]">
            <div className="flex items-start gap-3.5 mb-4">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  confirmModal.isDestructive ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                }`}
              >
                <AlertTriangle size={20} strokeWidth={2.4} />
              </div>
              <div>
                <h3 className="font-bold text-[17px] text-[#09122A]">{confirmModal.title}</h3>
                <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">{confirmModal.message}</p>
                {confirmModal.subtext && (
                  <p className="text-[11px] text-slate-400 mt-2 bg-[#F8FAFD] p-2.5 rounded-xl border border-[#EBF2FA]">
                    {confirmModal.subtext}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#F0F5FA]">
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-600 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmModal.onConfirm()}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-bold shadow-sm transition-all cursor-pointer ${
                  confirmModal.isDestructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#0E3A75] hover:bg-[#092854]'
                }`}
              >
                <Check size={13} strokeWidth={2.5} />
                <span>{confirmModal.confirmText || 'Confirm'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* CREATE / EDIT CAMPAIGN MODAL                                          */}
      {/* ===================================================================== */}
      {isCampaignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1" onClick={(e) => { if (e.target === e.currentTarget) setIsCampaignModalOpen(false); }}>
          <div className="w-full max-w-[500px] rounded-[24px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col overflow-hidden text-[#09122A]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F5FA] bg-[#F8FBFF]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center"><Megaphone size={16} /></div>
                <h3 className="font-bold text-[16px] text-[#09122A]">{editingCampaign ? 'Edit Campaign' : 'Create Campaign'}</h3>
              </div>
              <button onClick={() => setIsCampaignModalOpen(false)} className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"><X size={15} /></button>
            </div>

            <form onSubmit={handleSaveCampaign} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" /><span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#09122A] mb-1">Campaign Name <span className="text-rose-500">*</span></label>
                <input type="text" required value={campName} onChange={(e) => setCampName(e.target.value)} placeholder="e.g. Q4 AI Tool Launch" className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold focus:border-[#0E3A75] outline-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#09122A] mb-1">Target Audience</label>
                <input type="text" value={campAudience} onChange={(e) => setCampAudience(e.target.value)} placeholder="e.g. SaaS Founders, Solo Hackers" className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium focus:border-[#0E3A75] outline-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#09122A] mb-1">Description</label>
                <textarea rows={2} value={campDesc} onChange={(e) => setCampDesc(e.target.value)} placeholder="Strategic goals and value propositions..." className="w-full p-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium focus:border-[#0E3A75] outline-none resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">Start Date</label>
                  <input type="date" value={campStartDate} onChange={(e) => setCampStartDate(e.target.value)} className="w-full h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">Status</label>
                  <select value={campStatus} onChange={(e) => setCampStatus(e.target.value as any)} className="w-full h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-bold outline-none">
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#09122A] mb-1">Campaign Tags</label>
                <div className="flex gap-2">
                  <input type="text" value={campTagInput} onChange={(e) => setCampTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Add tag (press enter)..." className="flex-1 h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium outline-none" />
                  <button type="button" onClick={addTag} className="px-3 h-9 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer">Add</button>
                </div>
                {campTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {campTags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EBF3FC] text-[#0E3A75] text-xs font-mono">
                        #{tag}
                        <button type="button" onClick={() => setCampTags(campTags.filter((t) => t !== tag))} className="text-slate-400 hover:text-rose-600 cursor-pointer"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F5FA]">
                <button type="button" onClick={() => setIsCampaignModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer">
                  <Check size={14} /><span>{isSubmitting ? 'Saving...' : 'Save Campaign'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* QUEUE / SCHEDULE POST MODAL                                           */}
      {/* ===================================================================== */}
      {isPostModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1" onClick={(e) => { if (e.target === e.currentTarget) setIsPostModalOpen(false); }}>
          <div className="w-full max-w-[540px] rounded-[24px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col overflow-hidden text-[#09122A]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F5FA] bg-[#F8FBFF]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center"><CalendarDays size={16} /></div>
                <h3 className="font-bold text-[16px] text-[#09122A]">Queue Social Post</h3>
              </div>
              <button onClick={() => setIsPostModalOpen(false)} className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"><X size={15} /></button>
            </div>

            <form onSubmit={handleSavePost} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" /><span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">Target Campaign <span className="text-rose-500">*</span></label>
                  <select required value={postCampaignId} onChange={(e) => setPostCampaignId(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold outline-none">
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">Sender Account <span className="text-rose-500">*</span></label>
                  <select required value={postAccountId} onChange={(e) => setPostAccountId(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold outline-none">
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>@{a.handle} ({a.platform})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-[#09122A]">Post Copy <span className="text-rose-500">*</span></label>
                  <span className="text-[11px] font-mono text-slate-400">{postContent.length} chars</span>
                </div>
                <textarea rows={4} required value={postContent} onChange={(e) => setPostContent(e.target.value)} placeholder="Write punchy, curiosity-inducing copy with hooks and spacing..." className="w-full p-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium focus:border-[#0E3A75] outline-none resize-none leading-relaxed" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">Content Format</label>
                  <select value={postContentType} onChange={(e) => setPostContentType(e.target.value as any)} className="w-full h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium outline-none">
                    <option value="text">Standard Text</option>
                    <option value="image">Single Image</option>
                    <option value="video">Video</option>
                    <option value="carousel">Carousel</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">Media URL or Local Path</label>
                  <input type="text" value={postMediaUrl} onChange={(e) => setPostMediaUrl(e.target.value)} placeholder="https://... or storage/media/..." className="w-full h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-mono outline-none" />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F8FAFD] border border-[#EBF2FA] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#09122A] flex items-center gap-1.5"><Clock size={13} className="text-[#0E3A75]" /><span>Delivery Schedule</span></span>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer">
                    <input type="checkbox" checked={postIsDraft} onChange={(e) => setPostIsDraft(e.target.checked)} className="rounded text-[#0E3A75]" />
                    <span>Save as Draft</span>
                  </label>
                </div>

                {!postIsDraft && (
                  <div>
                    <input type="datetime-local" required value={postScheduledAt} onChange={(e) => setPostScheduledAt(e.target.value)} className="w-full h-9 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs font-semibold outline-none" />
                    <span className="text-[10.5px] text-slate-400 mt-1 block">Local time; will be converted to UTC for background dispatcher.</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F5FA]">
                <button type="button" onClick={() => setIsPostModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer">
                  <Sparkles size={14} /><span>{isSubmitting ? 'Queueing...' : postIsDraft ? 'Save Draft' : 'Schedule Post'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignsPage;