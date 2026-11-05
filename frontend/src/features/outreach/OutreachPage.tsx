import React, { useState, useEffect, useMemo } from 'react';
import {
  Send,
  Users2,
  Plus,
  RefreshCw,
  Trash2,
  Edit3,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  Clock,
  Layers,
  CheckCircle2,
  Ban,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  UserPlus,
  Search,
} from 'lucide-react';
import {
  api,
  type Lead,
  type OutreachCampaign,
  type OutreachMessage,
  type Account,
  type PlatformType,
  type LeadStage,
  type LeadTier,
  type OutreachChannel,
  type OutreachMessageStatus,
} from '../../api/client';
import { LoadingState } from '../../components/LoadingState';

// ============================================================================
// Badges & Helper Formatters
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
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1877F2] text-white text-[10px] font-bold">
      <span>Facebook</span>
    </span>
  );
}

function LeadStageBadge({ stage }: { stage: LeadStage }) {
  const styles: Record<LeadStage, { class: string; label: string }> = {
    discovered: { class: 'bg-slate-100 text-slate-600 border-slate-200/60', label: 'Discovered' },
    qualified: { class: 'bg-blue-50 text-blue-700 border-blue-200/60', label: 'Qualified' },
    contacted: { class: 'bg-amber-50 text-amber-700 border-amber-200/60', label: 'Contacted' },
    replied: { class: 'bg-purple-50 text-purple-700 border-purple-200/60', label: 'Replied' },
    converted: { class: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 font-bold', label: 'Converted 🎉' },
    unresponsive: { class: 'bg-slate-100 text-slate-400 border-slate-200/60', label: 'Unresponsive' },
    do_not_contact: { class: 'bg-rose-50 text-rose-700 border-rose-200/60', label: 'Do Not Contact' },
  };

  const current = styles[stage] || styles.discovered;

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${current.class}`}>
      {current.label}
    </span>
  );
}

function LeadTierBadge({ tier }: { tier: LeadTier }) {
  const colors: Record<LeadTier, string> = {
    nano: 'text-slate-500 bg-slate-50 border-slate-200/60',
    micro: 'text-blue-700 bg-blue-50 border-blue-200/60',
    mid: 'text-purple-700 bg-purple-50 border-purple-200/60',
    macro: 'text-amber-700 bg-amber-50 border-amber-200/60',
    mega: 'text-rose-700 bg-rose-50 border-rose-200/60',
  };

  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${colors[tier] || colors.nano}`}>
      {tier}
    </span>
  );
}

function MessageStatusBadge({ status }: { status: OutreachMessageStatus }) {
  const styles: Record<OutreachMessageStatus, { class: string; label: string; icon: React.ElementType }> = {
    staged: { class: 'bg-amber-50 text-amber-700 border-amber-200/60 animate-pulse', label: 'Awaiting Approval', icon: Clock },
    approved: { class: 'bg-emerald-50 text-emerald-700 border-emerald-200/60', label: 'Approved', icon: CheckCircle2 },
    dispatched: { class: 'bg-blue-50 text-blue-700 border-blue-200/60', label: 'Dispatched', icon: Send },
    rejected: { class: 'bg-rose-50 text-rose-700 border-rose-200/60', label: 'Rejected', icon: Ban },
    failed: { class: 'bg-rose-50 text-rose-700 border-rose-200/60', label: 'Failed', icon: AlertTriangle },
    draft: { class: 'bg-slate-100 text-slate-500 border-slate-200/60', label: 'Draft', icon: MessageSquare },
  };

  const item = styles[status] || styles.staged;
  const Icon = item.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${item.class}`}>
      <Icon size={10} />
      <span>{item.label}</span>
    </span>
  );
}

export const OutreachPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'messages' | 'leads' | 'campaigns'>('messages');
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Toasts
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Custom Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    subtext?: string;
    confirmText?: string;
    onConfirm: () => Promise<void> | void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Filters & Search
  const [messageStatusFilter, setMessageStatusFilter] = useState<OutreachMessageStatus | 'all'>('staged');
  const [leadStageFilter, setLeadStageFilter] = useState<LeadStage | 'all'>('all');
  const [leadTierFilter, setLeadTierFilter] = useState<LeadTier | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals State
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<OutreachCampaign | null>(null);

  // AI Scout Modal State
  const [isScoutModalOpen, setIsScoutModalOpen] = useState(false);
  const [scoutAccountId, setScoutAccountId] = useState('');
  const [scoutQuery, setScoutQuery] = useState('ai website builder');
  const [scoutMaxLeads, setScoutMaxLeads] = useState(5);
  const [isScouting, setIsScouting] = useState(false);

  // Review Staged Message Modal
  const [reviewingMessage, setReviewingMessage] = useState<OutreachMessage | null>(null);
  const [editedMessageContent, setEditedMessageContent] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Lead Form
  const [leadPlatform, setLeadPlatform] = useState<PlatformType>('twitter');
  const [leadHandle, setLeadHandle] = useState('');
  const [leadDisplayName, setLeadDisplayName] = useState('');
  const [leadBio, setLeadBio] = useState('');
  const [leadFollowers, setLeadFollowers] = useState<number | ''>('');
  const [leadTier, setLeadTier] = useState<LeadTier>('micro');
  const [leadStage, setLeadStage] = useState<LeadStage>('discovered');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadNotes, setLeadNotes] = useState('');
  const [leadTagInput, setLeadTagInput] = useState('');
  const [leadTags, setLeadTags] = useState<string[]>([]);

  // Stage Message Form
  const [stageTargetLeadId, setStageTargetLeadId] = useState('');
  const [stageAccountId, setStageAccountId] = useState('');
  const [stageContent, setStageContent] = useState('');
  const [stageChannel, setStageChannel] = useState<OutreachChannel>('dm');

  // Campaign Form
  const [campName, setCampName] = useState('');
  const [campAccountId, setCampAccountId] = useState('');
  const [campDescription, setCampDescription] = useState('');
  const [campTemplate, setCampTemplate] = useState('Hey @{handle}, love your content on SaaS!');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reusable refresh for user events
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedMessages, fetchedLeads, fetchedCampaigns, fetchedAccounts] = await Promise.all([
        api.outreach.listMessages({ limit: 100 }),
        api.outreach.listLeads({ limit: 100 }),
        api.outreach.listCampaigns(),
        api.accounts.list(false),
      ]);
      setMessages(fetchedMessages);
      setLeads(fetchedLeads);
      setCampaigns(fetchedCampaigns);
      setAccounts(fetchedAccounts);
    } catch (err: any) {
      setError(err?.message || 'Failed to refresh CRM data.');
    } finally {
      setLoading(false);
    }
  };

  // Mount effect (Zero synchronous setState inside effect body)
  useEffect(() => {
    let isMounted = true;

    Promise.all([
      api.outreach.listMessages({ limit: 100 }),
      api.outreach.listLeads({ limit: 100 }),
      api.outreach.listCampaigns(),
      api.accounts.list(false),
    ])
      .then(([m, l, c, a]) => {
        if (!isMounted) return;
        setMessages(m);
        setLeads(l);
        setCampaigns(c);
        setAccounts(a);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err?.message || 'Failed to initialize outreach CRM.');
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const totalLeads = leads.length;
    const qualifiedLeads = leads.filter((l) => l.stage === 'qualified').length;
    const contactedLeads = leads.filter((l) => l.stage === 'contacted' || l.stage === 'replied').length;
    const pendingReviews = messages.filter((m) => m.status === 'staged').length;

    return { totalLeads, qualifiedLeads, contactedLeads, pendingReviews };
  }, [leads, messages]);

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      return messageStatusFilter === 'all' || m.status === messageStatusFilter;
    });
  }, [messages, messageStatusFilter]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const matchStage = leadStageFilter === 'all' || l.stage === leadStageFilter;
      const matchTier = leadTierFilter === 'all' || l.tier === leadTierFilter;
      const matchQuery =
        !searchQuery.trim() ||
        l.handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.display_name && l.display_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (l.bio && l.bio.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchStage && matchTier && matchQuery;
    });
  }, [leads, leadStageFilter, leadTierFilter, searchQuery]);

  // =========================================================================
  // Human-in-the-Loop Review Actions
  // =========================================================================

  const openReviewModal = (msg: OutreachMessage) => {
    setReviewingMessage(msg);
    setEditedMessageContent(msg.content);
    setRejectionReason('');
    setIsRejecting(false);
  };

  const handleReviewAction = async (msgId: string, status: 'approved' | 'rejected') => {
    setIsSubmittingReview(true);
    try {
      const updated = await api.outreach.reviewMessage(msgId, {
        status,
        edited_content: status === 'approved' ? editedMessageContent : undefined,
        rejection_reason: status === 'rejected' ? rejectionReason || undefined : undefined,
      });

      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      showToast(status === 'approved' ? 'Cold DM approved for dispatch!' : 'Message rejected.');
      setReviewingMessage(null);
    } catch (err: any) {
      showToast(err?.message || 'Failed to process message review.', 'error');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // =========================================================================
  // Lead Actions
  // =========================================================================

  const openCreateLeadModal = () => {
    setEditingLead(null);
    setLeadPlatform('twitter');
    setLeadHandle('');
    setLeadDisplayName('');
    setLeadBio('');
    setLeadFollowers('');
    setLeadTier('micro');
    setLeadStage('discovered');
    setLeadEmail('');
    setLeadNotes('');
    setLeadTags([]);
    setFormError(null);
    setIsLeadModalOpen(true);
  };

  const openEditLeadModal = (lead: Lead) => {
    setEditingLead(lead);
    setLeadPlatform(lead.platform);
    setLeadHandle(lead.handle);
    setLeadDisplayName(lead.display_name || '');
    setLeadBio(lead.bio || '');
    setLeadFollowers(lead.follower_count ?? '');
    setLeadTier(lead.tier);
    setLeadStage(lead.stage);
    setLeadEmail(lead.email || '');
    setLeadNotes(lead.notes || '');
    setLeadTags(lead.tags || []);
    setFormError(null);
    setIsLeadModalOpen(true);
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = leadHandle.replace(/^@+/, '').trim();
    if (!cleanUser) {
      setFormError('Please enter a valid handle.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      if (editingLead) {
        const updated = await api.outreach.updateLead(editingLead.id, {
          display_name: leadDisplayName.trim() || undefined,
          bio: leadBio.trim() || undefined,
          follower_count: typeof leadFollowers === 'number' ? leadFollowers : undefined,
          tier: leadTier,
          stage: leadStage,
          email: leadEmail.trim() || undefined,
          notes: leadNotes.trim() || undefined,
          tags: leadTags,
        });
        setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
        showToast(`Lead @${updated.handle} updated.`);
      } else {
        const created = await api.outreach.createLead({
          platform: leadPlatform,
          handle: cleanUser,
          display_name: leadDisplayName.trim() || undefined,
          bio: leadBio.trim() || undefined,
          follower_count: typeof leadFollowers === 'number' ? leadFollowers : undefined,
          tier: leadTier,
          stage: leadStage,
          email: leadEmail.trim() || undefined,
          notes: leadNotes.trim() || undefined,
          tags: leadTags,
        });
        setLeads((prev) => [created, ...prev]);
        showToast(`Lead @${created.handle} added to CRM.`);
      }
      setIsLeadModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Could not save lead.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestDeleteLead = (lead: Lead) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Lead',
      message: `Delete lead @${lead.handle}?`,
      subtext: 'This will remove the prospect and their staged outreach history.',
      confirmText: 'Delete Lead',
      onConfirm: async () => {
        try {
          await api.outreach.deleteLead(lead.id);
          setLeads((prev) => prev.filter((l) => l.id !== lead.id));
          setMessages((prev) => prev.filter((m) => m.lead_id !== lead.id));
          showToast(`Lead @${lead.handle} removed.`);
        } catch (err: any) {
          showToast(err?.message || 'Failed to remove lead.', 'error');
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // =========================================================================
  // Stage Cold DM Actions
  // =========================================================================

  const openStageModal = (defaultLeadId?: string) => {
    setStageTargetLeadId(defaultLeadId || (leads[0]?.id ?? ''));
    setStageAccountId(accounts[0]?.id ?? '');
    setStageContent('');
    setStageChannel('dm');
    setFormError(null);
    setIsStageModalOpen(true);
  };

  const handleSaveStageMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageTargetLeadId || !stageAccountId || !stageContent.trim()) {
      setFormError('Please select a lead, account, and enter your message copy.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const created = await api.outreach.stageMessage({
        lead_id: stageTargetLeadId,
        account_id: stageAccountId,
        content: stageContent.trim(),
        channel: stageChannel,
      });

      setMessages((prev) => [created, ...prev]);
      setIsStageModalOpen(false);
      showToast('Cold DM staged behind review gate.');
      setActiveTab('messages');
    } catch (err: any) {
      setFormError(err?.message || 'Failed to stage message.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // Campaign Actions
  // =========================================================================

  const openCreateCampaignModal = () => {
    setEditingCampaign(null);
    setCampName('');
    setCampAccountId(accounts[0]?.id ?? '');
    setCampDescription('');
    setCampTemplate('Hey @{handle}, love your content on SaaS!');
    setFormError(null);
    setIsCampaignModalOpen(true);
  };

  const openEditCampaignModal = (c: OutreachCampaign) => {
    setEditingCampaign(c);
    setCampName(c.name);
    setCampAccountId(c.account_id);
    setCampDescription(c.description || '');
    setCampTemplate(c.template || '');
    setFormError(null);
    setIsCampaignModalOpen(true);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campName.trim() || !campAccountId) {
      setFormError('Please enter a campaign name and select a sender account.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      if (editingCampaign) {
        const updated = await api.outreach.updateCampaign(editingCampaign.id, {
          name: campName.trim(),
          account_id: campAccountId,
          description: campDescription.trim() || undefined,
          template: campTemplate.trim() || undefined,
        });
        setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        showToast(`Campaign "${updated.name}" updated.`);
      } else {
        const created = await api.outreach.createCampaign({
          name: campName.trim(),
          account_id: campAccountId,
          description: campDescription.trim() || undefined,
          template: campTemplate.trim() || undefined,
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

  const requestDeleteCampaign = (camp: OutreachCampaign) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Outreach Campaign',
      message: `Delete campaign "${camp.name}"?`,
      subtext: 'This will remove the campaign template and association from staged messages.',
      confirmText: 'Delete Campaign',
      onConfirm: async () => {
        try {
          await api.outreach.deleteCampaign(camp.id);
          setCampaigns((prev) => prev.filter((c) => c.id !== camp.id));
          showToast(`Campaign "${camp.name}" removed.`);
        } catch (err: any) {
          showToast(err?.message || 'Failed to delete campaign.', 'error');
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // =========================================================================
  // AI Scout Actions
  // =========================================================================

  const handleLaunchScout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scoutAccountId || !scoutQuery.trim()) return;

    setIsScouting(true);
    try {
      const res = await api.outreach.scoutLeads({
        account_id: scoutAccountId,
        niche_or_query: scoutQuery.trim(),
        max_leads: scoutMaxLeads,
        auto_import: true,
      });

      showToast(`Scout completed! Discovered ${res.discovered_count} leads and imported ${res.imported_count} into CRM.`);
      setIsScoutModalOpen(false);
      await loadData();
      setActiveTab('leads');
    } catch (err: any) {
      showToast(err?.message || 'Scouting failed.', 'error');
    } finally {
      setIsScouting(false);
    }
  };

  const addTag = () => {
    const clean = leadTagInput.trim().toLowerCase();
    if (clean && !leadTags.includes(clean)) {
      setLeadTags([...leadTags, clean]);
      setLeadTagInput('');
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
            <Send size={11} />
            <span>Outreach CRM & Human Approval Gate</span>
          </div>
          <h1 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.025em] text-[#09122A] leading-tight">
            Outreach CRM{' '}
            <span className="relative inline-block font-serif italic font-normal text-[#0D2149]">
              & cold DMs
              <svg className="absolute -bottom-1.5 left-0 w-full h-3 text-amber-400 pointer-events-none" viewBox="0 0 160 14" fill="none">
                <path d="M3 10C45 4 115 3 157 8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="text-[13.5px] text-[#475569] mt-1">
            Discover influencers and high-value prospects, stage personalized cold DMs, and approve before sending.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button onClick={loadData} title="Refresh CRM" className="w-9 h-9 rounded-xl bg-white border border-[#DCE7F5] hover:bg-slate-50 text-slate-600 flex items-center justify-center shadow-2xs cursor-pointer">
            <RefreshCw size={14} className={loading ? 'animate-spin text-[#0E3A75]' : ''} />
          </button>
          <button
            onClick={() => openStageModal()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white border border-[#DCE7F5] hover:border-[#0E3A75] text-[#0E3A75] text-xs font-bold shadow-2xs transition-all hover:scale-[1.01] active:scale-95 cursor-pointer"
          >
            <Send size={14} />
            <span>Stage Cold DM</span>
          </button>
          <button
            onClick={() => {
              setScoutAccountId(accounts[0]?.id ?? '');
              setIsScoutModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-md transition-all hover:scale-[1.01] active:scale-95 cursor-pointer"
          >
            <Sparkles size={14} />
            <span>AI Scout Leads</span>
          </button>
          <button
            onClick={openCreateLeadModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-white border border-[#DCE7F5] hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs cursor-pointer"
          >
            <UserPlus size={14} />
            <span>Import Lead</span>
          </button>
        </div>
      </div>

      {/* 2. KPI Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Staged for Review</span>
          <div className="text-2xl font-bold text-amber-700 flex items-center gap-1.5">
            {stats.pendingReviews > 0 && <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />}
            <span>{stats.pendingReviews}</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Approval required</span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Total CRM Leads</span>
          <div className="text-2xl font-bold text-[#09122A]">{stats.totalLeads} Prospects</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Influencers & builders</span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Qualified Stage</span>
          <div className="text-2xl font-bold text-blue-700">{stats.qualifiedLeads}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Ready for outreach</span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Conversations</span>
          <div className="text-2xl font-bold text-emerald-700">{stats.contactedLeads}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Contacted & Replied</span>
        </div>
      </div>

      {/* 3. Navigation View Switcher */}
      <div className="flex items-center justify-between mb-5 border-b border-[#E2ECF7] pb-3">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/80 border border-[#DCE7F5]">
          <button
            onClick={() => setActiveTab('messages')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'messages' ? 'bg-[#EBF3FC] text-[#0E3A75] shadow-2xs' : 'text-slate-500 hover:text-[#09122A]'
            }`}
          >
            <ShieldCheck size={14} />
            <span>Review Gate ({stats.pendingReviews})</span>
            {stats.pendingReviews > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-mono text-[9px] animate-pulse">
                {stats.pendingReviews}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('leads')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'leads' ? 'bg-[#EBF3FC] text-[#0E3A75] shadow-2xs' : 'text-slate-500 hover:text-[#09122A]'
            }`}
          >
            <Users2 size={14} />
            <span>Leads Directory ({leads.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'campaigns' ? 'bg-[#EBF3FC] text-[#0E3A75] shadow-2xs' : 'text-slate-500 hover:text-[#09122A]'
            }`}
          >
            <Layers size={14} />
            <span>Campaigns ({campaigns.length})</span>
          </button>
        </div>

        {/* Tab-specific Filters */}
        {activeTab === 'messages' ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'staged', label: 'Awaiting Approval', count: stats.pendingReviews },
              { id: 'dispatched', label: 'Dispatched', count: messages.filter((m) => m.status === 'dispatched' || m.status === 'approved').length },
              { id: 'rejected', label: 'Rejected', count: messages.filter((m) => m.status === 'rejected').length },
              { id: 'all', label: 'All', count: messages.length },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setMessageStatusFilter(pill.id as any)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  messageStatusFilter === pill.id
                    ? 'bg-[#EBF3FC] text-[#0E3A75] shadow-2xs'
                    : 'bg-white border border-[#DCE7F5] text-slate-500 hover:text-[#09122A]'
                }`}
              >
                <span>{pill.label}</span>
                <span className="font-mono text-[10px] opacity-75">({pill.count})</span>
              </button>
            ))}
          </div>
        ) : activeTab === 'leads' ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center h-8 px-2.5 rounded-xl bg-white border border-[#DCE7F5] text-xs">
              <Search size={12} className="text-slate-400 mr-1.5" />
              <input
                type="text"
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none text-xs text-[#09122A] w-28 sm:w-40"
              />
            </div>
            <select
              value={leadStageFilter}
              onChange={(e) => setLeadStageFilter(e.target.value as any)}
              className="h-8 px-2 rounded-xl bg-white border border-[#DCE7F5] text-xs font-semibold text-[#09122A] outline-none cursor-pointer"
            >
              <option value="all">All Stages</option>
              <option value="discovered">Discovered</option>
              <option value="qualified">Qualified</option>
              <option value="contacted">Contacted</option>
              <option value="replied">Replied</option>
              <option value="converted">Converted</option>
              <option value="do_not_contact">Do Not Contact</option>
            </select>
            <select
              value={leadTierFilter}
              onChange={(e) => setLeadTierFilter(e.target.value as any)}
              className="h-8 px-2 rounded-xl bg-white border border-[#DCE7F5] text-xs font-semibold text-[#09122A] outline-none cursor-pointer"
            >
              <option value="all">All Tiers</option>
              <option value="nano">Nano (&lt;10k)</option>
              <option value="micro">Micro (10k-50k)</option>
              <option value="mid">Mid (50k-200k)</option>
              <option value="macro">Macro (200k-1M)</option>
              <option value="mega">Mega (1M+)</option>
            </select>
          </div>
        ) : null}
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle size={15} /><span>{error}</span>
        </div>
      )}

      {/* 4. Tab A: Staged Cold DM Review Gate */}
      {activeTab === 'messages' && (
        <>
          {loading ? (
            <div className="py-20 flex justify-center"><LoadingState label="Loading review gate" variant="Orbit" /></div>
          ) : filteredMessages.length === 0 ? (
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-10 text-center shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center mx-auto mb-3 shadow-2xs">
                <ShieldCheck size={24} />
              </div>
              <h2 className="text-lg font-bold text-[#09122A]">
                {messageStatusFilter === 'staged'
                  ? 'No messages awaiting approval'
                  : `No messages with status "${messageStatusFilter}"`}
              </h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5 leading-relaxed">
                {messages.length > 0 && messageStatusFilter !== 'all'
                  ? `You have ${messages.length} message(s) in other statuses.`
                  : 'When the AI agent stages personalized cold messages, they pause here for human review.'}
              </p>
              <div className="flex justify-center gap-2">
                {messages.length > 0 && messageStatusFilter !== 'all' ? (
                  <button
                    onClick={() => setMessageStatusFilter('all')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#09122A] text-xs font-semibold cursor-pointer"
                  >
                    <span>View All Messages ({messages.length})</span>
                  </button>
                ) : (
                  <button
                    onClick={() => openStageModal()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    <Send size={14} /><span>Stage A Cold Message</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 pb-8">
              {filteredMessages.map((msg) => {
                const targetLead = leads.find((l) => l.id === msg.lead_id);
                const senderAccount = accounts.find((a) => a.id === msg.account_id);

                return (
                  <div key={msg.id} className="rounded-[22px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm hover:border-[#B8D0EC] transition-all flex flex-col justify-between">
                    <div>
                      {/* Context Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2.5">
                          <MessageStatusBadge status={msg.status} />
                          {targetLead && <PlatformBadge platform={targetLead.platform} />}
                          <span className="font-bold text-sm text-[#09122A]">@{targetLead?.handle || 'prospect'}</span>
                          {targetLead?.tier && <LeadTierBadge tier={targetLead.tier} />}
                          <span className="text-slate-300">•</span>
                          <span className="text-xs text-slate-400">
                            Sender: <strong className="text-[#0E3A75]">@{senderAccount?.handle || 'Unknown'}</strong> ({senderAccount?.daily_dms_sent ?? 0}/{senderAccount?.daily_dm_limit ?? 15} DMs today)
                          </span>
                        </div>

                        <span className="text-[11px] font-mono text-slate-400">
                          {new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Lead Bio Preview */}
                      {targetLead?.bio && (
                        <p className="text-[11px] text-slate-500 bg-[#F8FAFD] p-2.5 rounded-xl border border-[#EBF2FA] mb-3 line-clamp-2">
                          <span className="font-bold uppercase text-[9.5px] text-slate-400 block mb-0.5">Prospect Bio:</span>
                          {targetLead.bio}
                        </p>
                      )}

                      {/* Staged Message Copy */}
                      <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-100 mb-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-[#0E3A75] mb-1">
                          <span className="flex items-center gap-1"><Sparkles size={11} /><span>Personalized Outreach Copy:</span></span>
                          {msg.status === 'staged' && (
                            <button onClick={() => openReviewModal(msg)} className="text-[11px] text-[#0E3A75] hover:underline flex items-center gap-0.5 cursor-pointer">
                              <Edit3 size={11} /><span>Edit Draft</span>
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap select-text">
                          {msg.content}
                        </p>
                      </div>

                      {msg.last_error_message && (
                        <p className="text-[11px] text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200 mt-2">
                          {msg.last_error_message}
                        </p>
                      )}
                    </div>

                    {/* Human Action Bar */}
                    {msg.status === 'staged' && (
                      <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t border-[#F0F5FA] mt-2">
                        <button
                          onClick={() => {
                            setReviewingMessage(msg);
                            setIsRejecting(true);
                          }}
                          className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs font-semibold cursor-pointer transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleReviewAction(msg.id, 'approved')}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-bold shadow-xs cursor-pointer transition-all"
                        >
                          <Check size={13} strokeWidth={2.5} />
                          <span>Approve & Dispatch</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 5. Tab B: Leads Directory */}
      {activeTab === 'leads' && (
        <>
          {loading ? (
            <div className="py-20 flex justify-center"><LoadingState label="Loading CRM directory" variant="Orbit" /></div>
          ) : filteredLeads.length === 0 ? (
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-10 text-center shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center mx-auto mb-3 shadow-2xs">
                <Users2 size={24} />
              </div>
              <h2 className="text-lg font-bold text-[#09122A]">No leads found in this view</h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                Add target creators or import SaaS founders to track your relationship stages.
              </p>
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => {
                    setScoutAccountId(accounts[0]?.id ?? '');
                    setIsScoutModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Sparkles size={14} /><span>AI Scout Leads</span>
                </button>
                <button onClick={openCreateLeadModal} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-[#DCE7F5] text-slate-700 text-xs font-semibold shadow-2xs cursor-pointer">
                  <UserPlus size={14} /><span>Import Lead</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
              {filteredLeads.map((lead) => (
                <div key={lead.id} className="rounded-[22px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm hover:border-[#B8D0EC] transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <PlatformBadge platform={lead.platform} />
                          <LeadStageBadge stage={lead.stage} />
                          <LeadTierBadge tier={lead.tier} />
                        </div>
                        <h3 className="text-[17px] font-bold text-[#09122A]">@{lead.handle}</h3>
                        {lead.display_name && <span className="text-xs text-slate-500 block">{lead.display_name}</span>}
                      </div>

                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditLeadModal(lead)} className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer">
                          <Edit3 size={13} />
                        </button>
                        <button onClick={() => requestDeleteLead(lead)} className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {lead.bio && (
                      <p className="text-xs text-slate-600 mb-3 line-clamp-2 leading-relaxed">
                        {lead.bio}
                      </p>
                    )}

                    {lead.tags && lead.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {lead.tags.map((t, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-md bg-[#F1F6FC] text-[#0E3A75] font-mono text-[10.5px]">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3.5 border-t border-[#F0F5FA]">
                    <div className="text-[11px] font-mono text-slate-400">
                      <span>{lead.follower_count ? `${lead.follower_count.toLocaleString()} followers` : 'Followers n/a'}</span>
                    </div>

                    <button
                      onClick={() => openStageModal(lead.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-2xs cursor-pointer"
                    >
                      <Send size={12} strokeWidth={2.4} />
                      <span>Stage DM</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 6. Tab C: Outreach Campaigns */}
      {activeTab === 'campaigns' && (
        <>
          {loading ? (
            <div className="py-20 flex justify-center"><LoadingState label="Loading campaigns" variant="Orbit" /></div>
          ) : campaigns.length === 0 ? (
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-10 text-center shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center mx-auto mb-3 shadow-2xs">
                <Layers size={24} />
              </div>
              <h2 className="text-lg font-bold text-[#09122A]">No outreach campaigns active</h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                Group cold DMs under targeted initiatives with templated copy and audience filters.
              </p>
              <button onClick={openCreateCampaignModal} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer">
                <Plus size={14} /><span>Create Outreach Campaign</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
              {campaigns.map((camp) => (
                <div key={camp.id} className="rounded-[22px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm hover:border-[#B8D0EC] transition-all flex flex-col justify-between">
                  <div>
                    <h3 className="text-[17px] font-bold text-[#09122A] mb-1">{camp.name}</h3>
                    {camp.description && <p className="text-xs text-slate-500 mb-3">{camp.description}</p>}
                    {camp.template && (
                      <p className="text-[11px] text-slate-600 bg-[#F8FAFD] p-2.5 rounded-xl border border-[#EBF2FA] font-mono mb-3">
                        💬 {camp.template}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-[#F0F5FA] text-xs font-semibold text-[#0E3A75]">
                    <button onClick={() => openEditCampaignModal(camp)} className="text-[#0E3A75] hover:underline cursor-pointer">
                      Edit
                    </button>
                    <button onClick={() => requestDeleteCampaign(camp)} className="text-rose-600 hover:underline cursor-pointer">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* 7. REVIEW / EDIT STAGED DM MODAL                                      */}
      {/* ===================================================================== */}
      {reviewingMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1" onClick={(e) => { if (e.target === e.currentTarget) setReviewingMessage(null); }}>
          <div className="w-full max-w-lg rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col overflow-hidden text-[#09122A]">
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#F0F5FA] bg-[#F8FBFF]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center"><ShieldCheck size={16} /></div>
                <h3 className="font-bold text-[16px] text-[#09122A]">Review Staged Cold DM</h3>
              </div>
              <button onClick={() => setReviewingMessage(null)} className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"><X size={15} /></button>
            </div>

            <div className="p-6 space-y-4">
              {!isRejecting ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-[#09122A]">Personalized Cold Copy</label>
                    <span className="text-[11px] font-mono text-slate-400">{editedMessageContent.length} chars</span>
                  </div>
                  <textarea
                    rows={5}
                    value={editedMessageContent}
                    onChange={(e) => setEditedMessageContent(e.target.value)}
                    className="w-full p-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium focus:border-[#0E3A75] outline-none resize-none leading-relaxed"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-rose-600 mb-1">Rejection Reason</label>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. Not a good fit for this campaign"
                    className="w-full h-10 px-3 rounded-xl bg-[#F8FAFD] border border-rose-200 text-xs font-medium outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F5FA]">
                {!isRejecting ? (
                  <>
                    <button type="button" onClick={() => setIsRejecting(true)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs font-semibold cursor-pointer">
                      Reject
                    </button>
                    <button type="button" onClick={() => handleReviewAction(reviewingMessage.id, 'approved')} disabled={isSubmittingReview} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer">
                      <Check size={14} /><span>Approve & Dispatch</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setIsRejecting(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer">Cancel</button>
                    <button type="button" onClick={() => handleReviewAction(reviewingMessage.id, 'rejected')} disabled={isSubmittingReview} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer">
                      Confirm Rejection
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 8. IMPORT / EDIT LEAD MODAL                                           */}
      {/* ===================================================================== */}
      {isLeadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1" onClick={(e) => { if (e.target === e.currentTarget) setIsLeadModalOpen(false); }}>
          <div className="w-full max-w-[520px] rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col max-h-[88vh] overflow-hidden text-[#09122A]">
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#F0F5FA] bg-[#F8FBFF]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center"><UserPlus size={16} /></div>
                <h3 className="font-bold text-[16px] text-[#09122A]">{editingLead ? 'Edit Lead Profile' : 'Import Social Lead'}</h3>
              </div>
              <button onClick={() => setIsLeadModalOpen(false)} className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"><X size={15} /></button>
            </div>

            <form onSubmit={handleSaveLead} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" /><span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">Platform <span className="text-rose-500">*</span></label>
                  <select value={leadPlatform} onChange={(e) => setLeadPlatform(e.target.value as any)} className="w-full h-10 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-bold outline-none cursor-pointer">
                    <option value="twitter">X / Twitter</option>
                    <option value="instagram">Instagram</option>
                    <option value="email">Email</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">Handle <span className="text-rose-500">*</span></label>
                  <div className="flex items-center h-10 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] focus-within:border-[#0E3A75]">
                    <span className="text-slate-400 text-xs font-mono font-semibold mr-1">@</span>
                    <input type="text" required value={leadHandle} onChange={(e) => setLeadHandle(e.target.value)} placeholder="influencer_sam" className="w-full bg-transparent text-xs font-medium text-[#09122A] outline-none" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">Display Name</label>
                  <input type="text" value={leadDisplayName} onChange={(e) => setLeadDisplayName(e.target.value)} placeholder="Sam Altman" className="w-full h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">Followers Count</label>
                  <input type="number" value={leadFollowers} onChange={(e) => setLeadFollowers(e.target.value === '' ? '' : Number(e.target.value))} placeholder="25000" className="w-full h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#09122A] mb-1">Bio / Profile Summary</label>
                <textarea rows={2} value={leadBio} onChange={(e) => setLeadBio(e.target.value)} placeholder="Building developer tools..." className="w-full p-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium outline-none resize-none leading-relaxed" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">Audience Tier</label>
                  <select value={leadTier} onChange={(e) => setLeadTier(e.target.value as any)} className="w-full h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-bold outline-none cursor-pointer">
                    <option value="nano">Nano (&lt;10k)</option>
                    <option value="micro">Micro (10k-50k)</option>
                    <option value="mid">Mid (50k-200k)</option>
                    <option value="macro">Macro (200k-1M)</option>
                    <option value="mega">Mega (1M+)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">Relationship Stage</label>
                  <select value={leadStage} onChange={(e) => setLeadStage(e.target.value as any)} className="w-full h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-bold outline-none cursor-pointer">
                    <option value="discovered">Discovered</option>
                    <option value="qualified">Qualified</option>
                    <option value="contacted">Contacted</option>
                    <option value="replied">Replied</option>
                    <option value="converted">Converted</option>
                    <option value="do_not_contact">Do Not Contact</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#09122A] mb-1">Lead Tags</label>
                <div className="flex gap-2">
                  <input type="text" value={leadTagInput} onChange={(e) => setLeadTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Add tag (press enter)..." className="flex-1 h-8 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs outline-none" />
                  <button type="button" onClick={addTag} className="px-3 h-8 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer">Add</button>
                </div>
                {leadTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {leadTags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#EBF3FC] text-[#0E3A75] text-xs font-mono">
                        #{t}
                        <button type="button" onClick={() => setLeadTags(leadTags.filter((x) => x !== t))} className="text-slate-400 hover:text-rose-600 cursor-pointer"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F5FA]">
                <button type="button" onClick={() => setIsLeadModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer">
                  <Check size={14} /><span>{isSubmitting ? 'Saving...' : 'Save Lead'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 9. STAGE COLD DM MODAL (With Clean Empty Select Handling)             */}
      {/* ===================================================================== */}
      {isStageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1" onClick={(e) => { if (e.target === e.currentTarget) setIsStageModalOpen(false); }}>
          <div className="w-full max-w-[520px] rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col overflow-hidden text-[#09122A]">
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#F0F5FA] bg-[#F8FBFF]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center"><Send size={16} /></div>
                <h3 className="font-bold text-[16px] text-[#09122A]">Stage Cold DM</h3>
              </div>
              <button onClick={() => setIsStageModalOpen(false)} className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"><X size={15} /></button>
            </div>

            <form onSubmit={handleSaveStageMessage} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" /><span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Target Lead Selector */}
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">
                    Target Lead <span className="text-rose-500">*</span>
                  </label>
                  {leads.length === 0 ? (
                    <div className="h-10 px-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center justify-between">
                      <span className="truncate">No leads in CRM yet</span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsStageModalOpen(false);
                          openCreateLeadModal();
                        }}
                        className="font-bold underline text-[#0E3A75] hover:text-[#092854] shrink-0 cursor-pointer ml-1"
                      >
                        + Import Lead
                      </button>
                    </div>
                  ) : (
                    <select
                      required
                      value={stageTargetLeadId}
                      onChange={(e) => setStageTargetLeadId(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold outline-none focus:border-[#0E3A75] cursor-pointer"
                    >
                      <option value="" disabled>Select a lead...</option>
                      {leads.map((l) => (
                        <option key={l.id} value={l.id}>
                          @{l.handle} ({l.platform}) {l.follower_count ? `• ${l.follower_count.toLocaleString()} fans` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Sender Account Selector */}
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">
                    Sender Account <span className="text-rose-500">*</span>
                  </label>
                  {accounts.length === 0 ? (
                    <div className="h-10 px-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center">
                      <span>No connected accounts</span>
                    </div>
                  ) : (
                    <select
                      required
                      value={stageAccountId}
                      onChange={(e) => setStageAccountId(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold outline-none focus:border-[#0E3A75] cursor-pointer"
                    >
                      <option value="" disabled>Select sender account...</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          @{a.handle} ({a.platform})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-[#09122A]">Message Content <span className="text-rose-500">*</span></label>
                  <span className="text-[11px] font-mono text-slate-400">{stageContent.length} chars</span>
                </div>
                <textarea rows={5} required value={stageContent} onChange={(e) => setStageContent(e.target.value)} placeholder="Write personalized, genuine cold outreach copy..." className="w-full p-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium focus:border-[#0E3A75] outline-none resize-none leading-relaxed" />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F5FA]">
                <button type="button" onClick={() => setIsStageModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSubmitting || leads.length === 0 || accounts.length === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50">
                  <Clock size={14} /><span>Stage for Review</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 10. CREATE / EDIT OUTREACH CAMPAIGN MODAL                             */}
      {/* ===================================================================== */}
      {isCampaignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1" onClick={(e) => { if (e.target === e.currentTarget) setIsCampaignModalOpen(false); }}>
          <div className="w-full max-w-[500px] rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col overflow-hidden text-[#09122A]">
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#F0F5FA] bg-[#F8FBFF]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center"><Layers size={16} /></div>
                <h3 className="font-bold text-[16px] text-[#09122A]">{editingCampaign ? 'Edit Campaign' : 'New Outreach Campaign'}</h3>
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
                <input type="text" required value={campName} onChange={(e) => setCampName(e.target.value)} placeholder="e.g. Micro-Influencer Q4 Outreach" className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold focus:border-[#0E3A75] outline-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#09122A] mb-1">Default Sender Account <span className="text-rose-500">*</span></label>
                <select required value={campAccountId} onChange={(e) => setCampAccountId(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold outline-none cursor-pointer">
                  <option value="" disabled>Select sender account...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>@{a.handle} ({a.platform})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#09122A] mb-1">Description</label>
                <input type="text" value={campDescription} onChange={(e) => setCampDescription(e.target.value)} placeholder="Targeting tech creators with 10k-50k followers" className="w-full h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium outline-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#09122A] mb-1">DM Template (Supports &#123;handle&#125; and &#123;display_name&#125;)</label>
                <textarea rows={3} value={campTemplate} onChange={(e) => setCampTemplate(e.target.value)} className="w-full p-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium outline-none resize-none leading-relaxed" />
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
      {/* 11. AI SCOUT LEADS MODAL                                              */}
      {/* ===================================================================== */}
      {isScoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1" onClick={(e) => { if (e.target === e.currentTarget && !isScouting) setIsScoutModalOpen(false); }}>
          <div className="w-full max-w-[500px] rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col overflow-hidden text-[#09122A]">
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#F0F5FA] bg-[#F8FBFF]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center"><Sparkles size={16} /></div>
                <div>
                  <h3 className="font-bold text-[16px] text-[#09122A]">AI Creator Scout</h3>
                  <span className="text-xs text-slate-400">Autonomous browser exploration & bio qualification</span>
                </div>
              </div>
              {!isScouting && (
                <button onClick={() => setIsScoutModalOpen(false)} className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"><X size={15} /></button>
              )}
            </div>

            <form onSubmit={handleLaunchScout} className="p-6 space-y-4">
              {isScouting ? (
                <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                  <LoadingState label="Browser AI Agent exploring feeds & vetting bios" variant="Orbit" />
                  <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                    Chromium is browsing in stealth mode, reading candidate creator bios, filtering out bots, and qualifying prospects for "{scoutQuery}"...
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-[#09122A] mb-1">Explorer Account <span className="text-rose-500">*</span></label>
                    <select required value={scoutAccountId} onChange={(e) => setScoutAccountId(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold outline-none cursor-pointer">
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>@{a.handle} ({a.platform})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#09122A] mb-1">Niche, Keyword, or Hashtag <span className="text-rose-500">*</span></label>
                    <input type="text" required value={scoutQuery} onChange={(e) => setScoutQuery(e.target.value)} placeholder="e.g. ai tools, #buildinpublic, saas founder" className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold focus:border-[#0E3A75] outline-none" />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-[#09122A] mb-1">
                      <span>Max Leads to Vet</span>
                      <span className="font-mono text-[#0E3A75]">{scoutMaxLeads} creators</span>
                    </div>
                    <input type="range" min={1} max={10} value={scoutMaxLeads} onChange={(e) => setScoutMaxLeads(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg accent-[#0E3A75] cursor-pointer" />
                  </div>

                  <div className="p-3 rounded-xl bg-[#F8FAFD] border border-[#E2ECF7] text-xs text-slate-500">
                    <span className="font-bold text-[#09122A] block mb-0.5">Automated Bio Matching</span>
                    <span>The agent checks follower counts, evaluates niche relevance against your Brand Kit, and auto-imports verified leads into your CRM.</span>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F5FA]">
                    <button type="button" onClick={() => setIsScoutModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer">Cancel</button>
                    <button type="submit" className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-xs cursor-pointer">
                      <Sparkles size={14} /><span>Launch Scout Agent</span>
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 12. CUSTOM CONFIRMATION MODAL                                         */}
      {/* ===================================================================== */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1" onClick={(e) => { if (e.target === e.currentTarget) setConfirmModal((prev) => ({ ...prev, isOpen: false })); }}>
          <div className="w-full max-w-md rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl p-6 text-[#09122A]">
            <div className="flex items-start gap-3.5 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
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
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmModal.onConfirm()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                <Check size={13} strokeWidth={2.5} />
                <span>{confirmModal.confirmText || 'Confirm'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OutreachPage;