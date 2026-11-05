import React, { useState, useEffect, useMemo } from "react";
import {
  BookOpen,
  Sparkles,
  Save,
  RefreshCw,
  Plus,
  Trash2,
  X,
  Check,
  AlertCircle,
  Eye,
  Globe,
  Terminal,
  ShieldAlert,
  Target,
  Swords,
  Smile,
} from "lucide-react";
import { api, type BrandKit } from "../../api/client";
import { LoadingState } from "../../components/LoadingState";

export const BrandKitPage: React.FC = () => {
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Inspector Modal
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);

  // Active Tab
  const [activeSection, setActiveSection] = useState<
    "identity" | "voice" | "personas" | "battlecards"
  >("identity");

  // Form Fields
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [pricingSummary, setPricingSummary] = useState("");

  // Voice & Tone State
  const [emojiPolicy, setEmojiPolicy] = useState("minimal");
  const [toneInput, setToneInput] = useState("");
  const [toneTraits, setToneTraits] = useState<string[]>([]);
  const [bannedInput, setBannedInput] = useState("");
  const [bannedWords, setBannedWords] = useState<string[]>([]);
  const [phraseInput, setPhraseInput] = useState("");
  const [preferredPhrases, setPreferredPhrases] = useState<string[]>([]);

  // Personas State
  const [personas, setPersonas] = useState<
    Array<{ title: string; pain_points: string[]; pitch_angle: string }>
  >([]);
  const [newPersonaTitle, setNewPersonaTitle] = useState("");
  const [newPersonaPains, setNewPersonaPains] = useState("");
  const [newPersonaPitch, setNewPersonaPitch] = useState("");
  const [isAddingPersona, setIsAddingPersona] = useState(false);

  // Value Props & Battlecards State
  const [valueProps, setValueProps] = useState<
    Array<{ feature: string; benefit: string }>
  >([]);
  const [newFeature, setNewFeature] = useState("");
  const [newBenefit, setNewBenefit] = useState("");

  const [battlecards, setBattlecards] = useState<
    Array<{ competitor: string; why_we_win: string }>
  >([]);
  const [newCompetitor, setNewCompetitor] = useState("");
  const [newAdvantage, setNewAdvantage] = useState("");

  // Key Links State
  const [keyLinks, setKeyLinks] = useState<
    Array<{ title: string; url: string }>
  >([]);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const populateFields = (kit: BrandKit) => {
    setName(kit.name || "");
    setTagline(kit.tagline || "");
    setDescription(kit.description || "");
    setWebsiteUrl(kit.website_url || "");
    setIndustry(kit.industry || "");
    setPricingSummary(kit.pricing_summary || "");
    setEmojiPolicy(kit.emoji_policy || "minimal");
    setToneTraits(kit.tone_traits || []);
    setBannedWords(kit.banned_words || []);
    setPreferredPhrases(kit.preferred_phrases || []);
    setPersonas(kit.target_personas || []);
    setValueProps(kit.value_props || []);
    setBattlecards(kit.competitor_advantages || []);
    setKeyLinks(kit.key_links || []);
  };

  // User-triggered reload
  const loadBrandKit = async () => {
    setLoading(true);
    try {
      const data = await api.brand.getPrimary();
      setBrandKit(data);
      populateFields(data);
    } catch (err: any) {
      showToast(err?.message || "Failed to load Brand Kit.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Mount effect (Zero synchronous setState calls inside effect body)
  useEffect(() => {
    let isMounted = true;

    api.brand
      .getPrimary()
      .then((data) => {
        if (isMounted) {
          setBrandKit(data);
          populateFields(data);
        }
      })
      .catch((err) => {
        if (isMounted)
          showToast(err?.message || "Failed to initialize Brand Kit.", "error");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSaveBrandKit = async () => {
    if (!name.trim()) {
      showToast("Product name cannot be empty.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const payload: Partial<BrandKit> = {
        name: name.trim(),
        tagline: tagline.trim() || undefined,
        description: description.trim() || undefined,
        website_url: websiteUrl.trim() || undefined,
        industry: industry.trim() || undefined,
        pricing_summary: pricingSummary.trim() || undefined,
        emoji_policy: emojiPolicy,
        tone_traits: toneTraits,
        banned_words: bannedWords,
        preferred_phrases: preferredPhrases,
        target_personas: personas,
        value_props: valueProps,
        competitor_advantages: battlecards,
        key_links: keyLinks,
      };

      let saved: BrandKit;
      if (brandKit?.id) {
        saved = await api.brand.update(brandKit.id, payload);
      } else {
        saved = await api.brand.create({ ...payload, is_primary: true });
      }

      setBrandKit(saved);
      populateFields(saved);
      showToast(
        "Brand Kit saved! AI Copilot will use these guidelines immediately.",
      );
    } catch (err: any) {
      showToast(err?.message || "Failed to save Brand Kit.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Tag Add Helpers
  const addTag = (
    val: string,
    list: string[],
    setList: (v: string[]) => void,
    clear: () => void,
  ) => {
    const clean = val.trim().toLowerCase();
    if (clean && !list.includes(clean)) {
      setList([...list, clean]);
      clear();
    }
  };

  const handleAddPersona = () => {
    if (!newPersonaTitle.trim()) return;
    const pains = newPersonaPains
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    setPersonas([
      ...personas,
      {
        title: newPersonaTitle.trim(),
        pain_points: pains,
        pitch_angle: newPersonaPitch.trim(),
      },
    ]);
    setNewPersonaTitle("");
    setNewPersonaPains("");
    setNewPersonaPitch("");
    setIsAddingPersona(false);
  };

  const handleAddValueProp = () => {
    if (!newFeature.trim()) return;
    setValueProps([
      ...valueProps,
      { feature: newFeature.trim(), benefit: newBenefit.trim() },
    ]);
    setNewFeature("");
    setNewBenefit("");
  };

  const handleAddBattlecard = () => {
    if (!newCompetitor.trim()) return;
    setBattlecards([
      ...battlecards,
      { competitor: newCompetitor.trim(), why_we_win: newAdvantage.trim() },
    ]);
    setNewCompetitor("");
    setNewAdvantage("");
  };

  const handleAddLink = () => {
    if (!newLinkTitle.trim() || !newLinkUrl.trim()) return;
    setKeyLinks([
      ...keyLinks,
      { title: newLinkTitle.trim(), url: newLinkUrl.trim() },
    ]);
    setNewLinkTitle("");
    setNewLinkUrl("");
  };

  // Compile prompt context string for visual preview in modal
  const compiledPromptContext = useMemo(() => {
    const lines = [
      `=== BRAND GROUND TRUTH: ${name.toUpperCase() || "UNNAMED BRAND"} ===`,
      `Tagline: ${tagline || "N/A"}`,
      `Website: ${websiteUrl || "N/A"}`,
      `Industry: ${industry || "N/A"}`,
      `Core Description: ${description || "N/A"}`,
      "",
      `Tone Guidelines: ${toneTraits.join(", ") || "N/A"}`,
      `Banned Words/Fluff to NEVER use: ${bannedWords.join(", ") || "None"}`,
      `Emoji Policy: ${emojiPolicy}`,
    ];

    if (preferredPhrases.length > 0) {
      lines.push(`Preferred Phrases: ${preferredPhrases.join(", ")}`);
    }

    if (personas.length > 0) {
      lines.push("\nTarget Buyer Personas:");
      personas.forEach((p) => {
        lines.push(
          `- ${p.title}: Pain points: [${p.pain_points.join(", ")}]. Pitch angle: '${p.pitch_angle}'`,
        );
      });
    }

    if (valueProps.length > 0) {
      lines.push("\nCore Value Propositions:");
      valueProps.forEach((vp) =>
        lines.push(`- ${vp.feature} -> ${vp.benefit}`),
      );
    }

    if (battlecards.length > 0) {
      lines.push("\nCompetitor Battlecards:");
      battlecards.forEach((comp) =>
        lines.push(`- vs ${comp.competitor}: ${comp.why_we_win}`),
      );
    }

    if (pricingSummary) {
      lines.push(`\nPricing Reference: ${pricingSummary}`);
    }

    lines.push("==================================================");
    return lines.join("\n");
  }, [
    name,
    tagline,
    websiteUrl,
    industry,
    description,
    toneTraits,
    bannedWords,
    preferredPhrases,
    emojiPolicy,
    personas,
    valueProps,
    battlecards,
    pricingSummary,
  ]);

  return (
    <div className="relative h-full overflow-y-auto px-3 sm:px-6 py-4 custom-scrollbar max-w-6xl mx-auto w-full font-sans select-none text-[#09122A]">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl text-white text-xs font-semibold shadow-2xl animate-fade-up-1 ${
            toast.type === "error" ? "bg-rose-600" : "bg-[#0E3A75]"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle size={15} />
          ) : (
            <Check size={15} className="text-emerald-400" strokeWidth={3} />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 border border-[#DCE7F5] text-[11px] font-bold uppercase tracking-wider text-[#0E3A75] mb-2 shadow-2xs">
            <BookOpen size={11} />
            <span>AI Knowledge & Positioning Ground Truth</span>
          </div>
          <h1 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.025em] text-[#09122A] leading-tight">
            Brand Kit{" "}
            <span className="relative inline-block font-serif italic font-normal text-[#0D2149]">
              & voice guidelines
              <svg
                className="absolute -bottom-1.5 left-0 w-full h-3 text-amber-400 pointer-events-none"
                viewBox="0 0 160 14"
                fill="none"
              >
                <path
                  d="M3 10C45 4 115 3 157 8"
                  stroke="currentColor"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>
          <p className="text-[13.5px] text-[#475569] mt-1">
            Define your product positioning, voice rules, and customer personas
            so the AI Copilot crafts authentic, high-converting copy without
            hallucinating.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={loadBrandKit}
            title="Reload Brand Kit"
            className="w-9 h-9 rounded-xl bg-white border border-[#DCE7F5] hover:bg-slate-50 text-slate-600 flex items-center justify-center shadow-2xs cursor-pointer"
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin text-[#0E3A75]" : ""}
            />
          </button>
          <button
            type="button"
            onClick={() => setIsPromptModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-white border border-[#DCE7F5] hover:border-[#0E3A75] text-[#0E3A75] text-xs font-bold shadow-2xs transition-all cursor-pointer"
          >
            <Eye size={14} />
            <span>Inspect AI Context</span>
          </button>
          <button
            type="button"
            onClick={handleSaveBrandKit}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-md transition-all hover:scale-[1.01] active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Save size={14} />
            <span>{isSaving ? "Saving..." : "Save Brand Kit"}</span>
          </button>
        </div>
      </div>

      {/* 2. Navigation Pills */}
      <div className="flex flex-wrap items-center gap-2 mb-6 p-1.5 rounded-2xl bg-white/80 border border-[#DCE7F5]">
        <button
          onClick={() => setActiveSection("identity")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSection === "identity"
              ? "bg-[#EBF3FC] text-[#0E3A75] shadow-2xs"
              : "text-slate-500 hover:text-[#09122A]"
          }`}
        >
          <Globe size={13} />
          <span>Product Identity</span>
        </button>
        <button
          onClick={() => setActiveSection("voice")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSection === "voice"
              ? "bg-[#EBF3FC] text-[#0E3A75] shadow-2xs"
              : "text-slate-500 hover:text-[#09122A]"
          }`}
        >
          <Sparkles size={13} />
          <span>Voice & Tone Rules</span>
        </button>
        <button
          onClick={() => setActiveSection("personas")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSection === "personas"
              ? "bg-[#EBF3FC] text-[#0E3A75] shadow-2xs"
              : "text-slate-500 hover:text-[#09122A]"
          }`}
        >
          <Target size={13} />
          <span>Buyer Personas ({personas.length})</span>
        </button>
        <button
          onClick={() => setActiveSection("battlecards")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSection === "battlecards"
              ? "bg-[#EBF3FC] text-[#0E3A75] shadow-2xs"
              : "text-slate-500 hover:text-[#09122A]"
          }`}
        >
          <Swords size={13} />
          <span>Value Props & Battlecards</span>
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingState label="Loading Brand Kit" variant="Orbit" />
        </div>
      ) : (
        <div className="space-y-6 pb-12">
          {/* SECTION A: PRODUCT IDENTITY */}
          {activeSection === "identity" && (
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-6 shadow-sm space-y-4">
              <div className="border-b border-[#F0F5FA] pb-3 mb-4">
                <h3 className="font-bold text-base text-[#09122A]">
                  Core Company & Product Identity
                </h3>
                <span className="text-xs text-slate-400">
                  The foundational truth the AI agent references about your
                  business.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">
                    Company / Product Name{" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Orlume"
                    className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-bold text-[#09122A] focus:border-[#0E3A75] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">
                    Official Website URL
                  </label>
                  <input
                    type="text"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://orlume.site"
                    className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-mono text-[#0E3A75] focus:border-[#0E3A75] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">
                    One-Sentence Tagline / Hook
                  </label>
                  <input
                    type="text"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="AI Website Builder & Autonomous Growth Suite"
                    className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium focus:border-[#0E3A75] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">
                    Industry / Niche
                  </label>
                  <input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="SaaS / Marketing Automation / Developer Tools"
                    className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium focus:border-[#0E3A75] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#09122A] mb-1">
                  Core Description & Mission Elevator Pitch
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain exactly what problem your product solves, who it is for, and how it delivers value..."
                  className="w-full p-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium focus:border-[#0E3A75] outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Key Links */}
              <div className="p-4 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7] space-y-3">
                <span className="text-xs font-bold text-[#09122A] block">
                  Essential Reference Links (Pricing, Docs, Booking)
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                    placeholder="Title (e.g. Documentation)"
                    className="w-1/3 h-9 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs outline-none"
                  />
                  <input
                    type="text"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 h-9 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs font-mono outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddLink}
                    className="px-3.5 h-9 rounded-xl bg-[#0E3A75] text-white text-xs font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                {keyLinks.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {keyLinks.map((l, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-[#DCE7F5] text-xs font-medium"
                      >
                        <strong>{l.title}:</strong>
                        <span className="font-mono text-[#0E3A75]">
                          {l.url}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setKeyLinks(keyLinks.filter((_, i) => i !== idx))
                          }
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION B: VOICE & TONE GUIDELINES */}
          {activeSection === "voice" && (
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-6 shadow-sm space-y-5">
              <div className="border-b border-[#F0F5FA] pb-3">
                <h3 className="font-bold text-base text-[#09122A]">
                  Voice, Tone & Content Guardrails
                </h3>
                <span className="text-xs text-slate-400">
                  Strict rules the AI agent enforces when drafting tweets,
                  carousels, or cold DMs.
                </span>
              </div>

              {/* Tone Traits */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-[#09122A]">
                    Tone Traits (How the brand sounds)
                  </label>
                  <span className="text-[10px] text-slate-400">
                    e.g. punchy, direct, authentic
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={toneInput}
                    onChange={(e) => setToneInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(toneInput, toneTraits, setToneTraits, () =>
                          setToneInput(""),
                        );
                      }
                    }}
                    placeholder="Add tone trait (press enter)..."
                    className="flex-1 h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      addTag(toneInput, toneTraits, setToneTraits, () =>
                        setToneInput(""),
                      )
                    }
                    className="px-3.5 h-9 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {toneTraits.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 font-mono text-xs font-bold border border-blue-200"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() =>
                          setToneTraits(toneTraits.filter((x) => x !== t))
                        }
                        className="text-blue-400 hover:text-rose-600"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Banned Words / Anti-Fluff */}
              <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-200 space-y-2">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert size={15} className="text-rose-600" />
                  <label className="block text-xs font-bold text-rose-900">
                    Banned Buzzwords & AI Fluff (NEVER USE)
                  </label>
                </div>
                <span className="text-[11px] text-rose-700 block">
                  The agent is strictly instructed to reject these corporate
                  clichés.
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={bannedInput}
                    onChange={(e) => setBannedInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(bannedInput, bannedWords, setBannedWords, () =>
                          setBannedInput(""),
                        );
                      }
                    }}
                    placeholder="e.g. delve, leverage, game-changer, unleash..."
                    className="flex-1 h-9 px-3 rounded-xl bg-white border border-rose-200 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      addTag(bannedInput, bannedWords, setBannedWords, () =>
                        setBannedInput(""),
                      )
                    }
                    className="px-3.5 h-9 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                  >
                    Ban Word
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {bannedWords.map((w) => (
                    <span
                      key={w}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white text-rose-700 font-mono text-xs font-bold border border-rose-300"
                    >
                      🚫 {w}
                      <button
                        type="button"
                        onClick={() =>
                          setBannedWords(bannedWords.filter((x) => x !== w))
                        }
                        className="text-rose-400 hover:text-rose-900"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Preferred Phrases */}
              <div>
                <label className="block text-xs font-bold text-[#09122A] mb-1">
                  Preferred Brand Phrases & Mottos
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={phraseInput}
                    onChange={(e) => setPhraseInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(
                          phraseInput,
                          preferredPhrases,
                          setPreferredPhrases,
                          () => setPhraseInput(""),
                        );
                      }
                    }}
                    placeholder="e.g. built for founders, ship faster..."
                    className="flex-1 h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      addTag(
                        phraseInput,
                        preferredPhrases,
                        setPreferredPhrases,
                        () => setPhraseInput(""),
                      )
                    }
                    className="px-3.5 h-9 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {preferredPhrases.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 font-mono text-xs font-bold border border-emerald-200"
                    >
                      ✨ "{p}"
                      <button
                        type="button"
                        onClick={() =>
                          setPreferredPhrases(
                            preferredPhrases.filter((x) => x !== p),
                          )
                        }
                        className="text-emerald-400 hover:text-rose-600"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Emoji Policy */}
              <div>
                <label className="block text-xs font-bold text-[#09122A] mb-1.5 flex items-center gap-1.5">
                  <Smile size={14} className="text-[#0E3A75]" />
                  <span>Emoji Usage Policy</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "minimal", label: "Minimal (1-2 per post, clean)" },
                    {
                      id: "expressive",
                      label: "Expressive (Curiosity hooks & bullet emojis)",
                    },
                    { id: "none", label: "None (Pure editorial prose)" },
                  ].map((policy) => (
                    <button
                      key={policy.id}
                      type="button"
                      onClick={() => setEmojiPolicy(policy.id)}
                      className={`p-3 rounded-2xl border text-xs text-left transition-all cursor-pointer ${
                        emojiPolicy === policy.id
                          ? "bg-[#F4F9FF] border-[#0E3A75] text-[#0E3A75] font-bold shadow-2xs"
                          : "bg-[#F8FAFD] border-[#DCE7F5] text-slate-600"
                      }`}
                    >
                      {policy.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SECTION C: BUYER PERSONAS */}
          {activeSection === "personas" && (
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[#F0F5FA] pb-3">
                <div>
                  <h3 className="font-bold text-base text-[#09122A]">
                    Target Buyer Personas (ICP)
                  </h3>
                  <span className="text-xs text-slate-400">
                    The agent references these personas when searching for
                    influencers or staging cold DMs.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingPersona(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Add Persona</span>
                </button>
              </div>

              {isAddingPersona && (
                <div className="p-4.5 rounded-2xl bg-[#F8FAFD] border border-[#0E3A75] space-y-3 animate-fade-up-1">
                  <h4 className="font-bold text-xs text-[#0E3A75] uppercase">
                    New Target Persona
                  </h4>
                  <input
                    type="text"
                    value={newPersonaTitle}
                    onChange={(e) => setNewPersonaTitle(e.target.value)}
                    placeholder="Persona Title (e.g. Solo SaaS Founders)"
                    className="w-full h-9 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs font-bold outline-none"
                  />
                  <input
                    type="text"
                    value={newPersonaPains}
                    onChange={(e) => setNewPersonaPains(e.target.value)}
                    placeholder="Pain Points (comma-separated: e.g. No time for marketing, low site conversions)"
                    className="w-full h-9 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs outline-none"
                  />
                  <input
                    type="text"
                    value={newPersonaPitch}
                    onChange={(e) => setNewPersonaPitch(e.target.value)}
                    placeholder="Pitch Angle (e.g. Build in minutes, automate distribution on autopilot)"
                    className="w-full h-9 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs outline-none"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingPersona(false)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddPersona}
                      className="px-4 py-1.5 rounded-xl bg-[#0E3A75] text-white text-xs font-bold cursor-pointer"
                    >
                      Save Persona
                    </button>
                  </div>
                </div>
              )}

              {personas.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 bg-[#F8FAFD] rounded-2xl border border-[#DCE7F5]">
                  <Target
                    size={24}
                    className="mx-auto mb-2 opacity-50 text-[#0E3A75]"
                  />
                  <span>
                    No buyer personas defined yet. Add your primary customer
                    profiles so cold DMs are laser-targeted.
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {personas.map((p, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7] flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-sm text-[#09122A]">
                            {p.title}
                          </h4>
                          <button
                            type="button"
                            onClick={() =>
                              setPersonas(personas.filter((_, i) => i !== idx))
                            }
                            className="text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="space-y-1.5 mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            Pain Points:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {p.pain_points.map((pain, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-white border border-[#DCE7F5] text-[11px] text-slate-700"
                              >
                                {pain}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                            Pitch Angle:
                          </span>
                          <p className="text-xs text-slate-700 bg-white p-2 rounded-xl border border-[#DCE7F5] italic">
                            "{p.pitch_angle}"
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION D: VALUE PROPS & BATTLECARDS */}
          {activeSection === "battlecards" && (
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-6 shadow-sm space-y-6">
              {/* Value Propositions */}
              <div className="space-y-3">
                <div className="border-b border-[#F0F5FA] pb-2">
                  <h3 className="font-bold text-base text-[#09122A]">
                    Feature $\rightarrow$ Benefit Matrix
                  </h3>
                  <span className="text-xs text-slate-400">
                    What specific capabilities exist and why the user cares.
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    placeholder="Feature (e.g. Autonomous Trigger Radar)"
                    className="w-1/3 h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold outline-none"
                  />
                  <input
                    type="text"
                    value={newBenefit}
                    onChange={(e) => setNewBenefit(e.target.value)}
                    placeholder="Benefit (e.g. Intercepts competitor complaints live on Twitter)"
                    className="flex-1 h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddValueProp}
                    className="px-4 h-9 rounded-xl bg-[#0E3A75] text-white text-xs font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                <div className="space-y-1.5">
                  {valueProps.map((vp, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFD] border border-[#E2ECF7] text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <strong className="text-[#0E3A75] font-mono">
                          {vp.feature}:
                        </strong>
                        <span className="text-slate-700">{vp.benefit}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setValueProps(valueProps.filter((_, i) => i !== idx))
                        }
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Competitor Battlecards */}
              <div className="space-y-3 pt-4 border-t border-[#F0F5FA]">
                <div className="border-b border-[#F0F5FA] pb-2">
                  <h3 className="font-bold text-base text-[#09122A]">
                    Competitor Battlecards & Why We Win
                  </h3>
                  <span className="text-xs text-slate-400">
                    Used by the agent when drafting trigger auto-replies to
                    alternative-seeking posts.
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCompetitor}
                    onChange={(e) => setNewCompetitor(e.target.value)}
                    placeholder="Competitor (e.g. Hootsuite)"
                    className="w-1/3 h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold outline-none"
                  />
                  <input
                    type="text"
                    value={newAdvantage}
                    onChange={(e) => setNewAdvantage(e.target.value)}
                    placeholder="Why We Win (e.g. Zero per-seat fees, self-hosted stealth browser automation)"
                    className="flex-1 h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddBattlecard}
                    className="px-4 h-9 rounded-xl bg-[#0E3A75] text-white text-xs font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                <div className="space-y-1.5">
                  {battlecards.map((comp, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFD] border border-[#E2ECF7] text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <strong className="text-rose-700 font-mono">
                          vs {comp.competitor}:
                        </strong>
                        <span className="text-slate-700">
                          {comp.why_we_win}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setBattlecards(
                            battlecards.filter((_, i) => i !== idx),
                          )
                        }
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pricing Reference */}
              <div className="pt-4 border-t border-[#F0F5FA]">
                <label className="block text-xs font-bold text-[#09122A] mb-1">
                  Pricing Tiers Reference
                </label>
                <input
                  type="text"
                  value={pricingSummary}
                  onChange={(e) => setPricingSummary(e.target.value)}
                  placeholder="e.g. Free forever tier, $29/mo Pro with unlimited accounts"
                  className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium focus:border-[#0E3A75] outline-none"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. INSPECT COMPILED PROMPT CONTEXT MODAL                              */}
      {/* ===================================================================== */}
      {isPromptModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPromptModalOpen(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-[#09122A]">
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#F0F5FA] bg-[#F8FBFF]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center">
                  <Terminal size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-[16px] text-[#09122A]">
                    AI Agent Ground Truth Inspector
                  </h3>
                  <span className="text-xs text-slate-400">
                    Compiled context returned when agent invokes
                    `get_brand_knowledge`
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsPromptModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <pre className="p-4 rounded-2xl bg-[#09122A] text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed select-text shadow-2xs">
                {compiledPromptContext}
              </pre>
            </div>

            <div className="px-6 py-3.5 border-t border-[#F0F5FA] bg-[#F8FBFF] flex justify-end">
              <button
                onClick={() => setIsPromptModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrandKitPage;
