import { useState, useEffect, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useShadowDrop } from "../hooks/useShadowDrop";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
    Shield, Zap, Eye, EyeOff, Users, Gift, ArrowRight,
    Upload, FileSpreadsheet, Clock, CheckCircle2,
    BarChart3, Wallet, ChevronDown, Copy, ExternalLink,
    Sparkles, Lock, Globe, AlertCircle, Loader2, Trash2
} from "lucide-react";

export function Dashboard() {
    const { connected, publicKey, connection } = useShadowDrop();
    const [balance, setBalance] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<"create" | "claim" | "manage">("create");
    const [requestingAirdrop, setRequestingAirdrop] = useState(false);
    const [airdropStatus, setAirdropStatus] = useState<'idle' | 'success'>('idle');
    const [systemStatus, setSystemStatus] = useState<'online' | 'offline' | 'checking'>('checking');

    // System Status Check
    useEffect(() => {
        if (!connection) return;

        const checkSystem = async () => {
            try {
                await connection.getVersion();
                setSystemStatus('online');
            } catch (e) {
                setSystemStatus('offline');
            }
        };

        checkSystem(); // Initial check
        const id = setInterval(checkSystem, 3000); // Check every 3s
        return () => clearInterval(id);
    }, [connection]);

    // Fetch balance
    useEffect(() => {
        if (!connection || !publicKey) return;

        const id = setInterval(async () => {
            try {
                const bal = await connection.getBalance(publicKey);
                setBalance(bal / LAMPORTS_PER_SOL);
            } catch (e) {
                console.error("Failed to fetch balance", e);
            }
        }, 2000); // Update every 2s

        // Initial fetch
        connection.getBalance(publicKey).then(b => setBalance(b / LAMPORTS_PER_SOL)).catch(() => { });

        return () => clearInterval(id);
    }, [publicKey, connection]);

    const handleRequestAirdrop = async () => {
        try {
            if (!publicKey) return;
            setRequestingAirdrop(true);
            const signature = await connection.requestAirdrop(publicKey, 1 * LAMPORTS_PER_SOL);
            await connection.confirmTransaction(signature);
            setAirdropStatus('success');
            setTimeout(() => setAirdropStatus('idle'), 3000);
        } catch (e) {
            console.error(e);
            alert("Airdrop failed (Localnet might be down): " + e);
        } finally {
            setRequestingAirdrop(false);
        }
    };

    if (!connected) {
        return <LandingPage />;
    }

    return (
        <div className="min-h-screen bg-[#0a0a0f]">
            {/* Header */}
            <header className="border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
                                <Shield className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xl font-bold text-white">Shadow Drop</span>
                        </div>

                        {/* Navigation */}
                        <nav className="hidden md:flex items-center gap-1">
                            {[
                                { id: "create", label: "Create Airdrop", icon: Gift },
                                { id: "claim", label: "Claim", icon: Zap },
                                { id: "manage", label: "My Campaigns", icon: BarChart3 },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as "create" | "claim" | "manage")}
                                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${activeTab === tab.id
                                        ? "bg-white/10 text-white"
                                        : "text-gray-400 hover:text-white hover:bg-white/5"
                                        }`}
                                >
                                    <tab.icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* System Status Indicator */}
                        {systemStatus === 'online' ? (
                            <>
                                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                    <span className="text-xs text-emerald-400 font-medium">Localnet</span>
                                </div>
                                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-full">
                                    <div className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
                                    <span className="text-xs text-violet-300 font-medium">Contracts Online</span>
                                </div>
                            </>
                        ) : systemStatus === 'offline' ? (
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full animate-pulse">
                                <AlertCircle className="w-3 h-3 text-red-500" />
                                <span className="text-xs text-red-400 font-medium">System Offline</span>
                            </div>
                        ) : (
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full opacity-50">
                                <Loader2 className="w-3 h-3 text-yellow-500 animate-spin" />
                                <span className="text-xs text-yellow-400 font-medium">Connecting...</span>
                            </div>
                        )}

                        {/* Balance Display */}
                        {publicKey && (
                            <div className="flex items-center gap-3 bg-black/20 rounded-full px-4 py-1.5 border border-white/5">
                                <Wallet className="w-4 h-4 text-violet-400" />
                                <span className="font-mono text-sm text-violet-100">
                                    {balance !== null ? balance.toFixed(2) : "..."} SOL
                                </span>
                            </div>
                        )}

                        <button
                            onClick={handleRequestAirdrop}
                            disabled={requestingAirdrop}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${airdropStatus === 'success'
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/20"
                                : requestingAirdrop
                                    ? "bg-violet-500/10 text-violet-300 border border-violet-500/20 opacity-50 cursor-wait"
                                    : "bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/20"
                                }`}
                        >
                            {airdropStatus === 'success' ? (
                                <span className="flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Sent!
                                </span>
                            ) : requestingAirdrop ? (
                                "Requesting..."
                            ) : (
                                "Request 1 SOL"
                            )}
                        </button>
                        <WalletMultiButton className="!bg-white/5 hover:!bg-white/10 !border !border-white/10 !rounded-xl !py-2.5 !px-4 !text-sm !font-medium" />
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                {activeTab === "create" && <CreateAirdrop balance={balance} />}
                {activeTab === "claim" && <ClaimAirdrop />}
                {activeTab === "manage" && <ManageCampaigns onViewCreate={() => setActiveTab("create")} systemStatus={systemStatus} />}
            </main>
        </div>
    );
}

function LandingPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/20 via-transparent to-transparent" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-violet-500/10 rounded-full blur-3xl" />

            {/* Header */}
            <header className="relative z-10 border-b border-white/5">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
                            <Shield className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold text-white">Shadow Drop</span>
                    </div>
                    <WalletMultiButton className="!bg-gradient-to-r !from-violet-600 !to-fuchsia-600 hover:!from-violet-500 hover:!to-fuchsia-500 !border-0 !rounded-xl !py-3 !px-6 !font-semibold !shadow-lg !shadow-violet-500/25" />
                </div>
            </header>

            {/* Hero Section */}
            <div className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
                <div className="text-center space-y-8">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-full">
                        <Sparkles className="w-4 h-4 text-violet-400" />
                        <span className="text-sm text-violet-300">Powered by Light Protocol ZK Compression</span>
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold text-white leading-tight">
                        Private Airdrops
                        <br />
                        <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
                            at Scale
                        </span>
                    </h1>

                    <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                        Launch privacy-preserving airdrops on Solana. Recipients claim anonymously
                        with zero-knowledge proofs. Your recipient list stays private.
                    </p>

                    <div className="flex flex-wrap justify-center gap-4">
                        <WalletMultiButton className="!bg-gradient-to-r !from-violet-600 !to-fuchsia-600 hover:!from-violet-500 hover:!to-fuchsia-500 !border-0 !rounded-xl !py-4 !px-8 !text-lg !font-semibold !shadow-lg !shadow-violet-500/25" />
                        <button className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-semibold transition-all">
                            View Docs
                        </button>
                    </div>
                </div>

                {/* Features Grid */}
                <div className="grid md:grid-cols-3 gap-6 mt-24">
                    {[
                        {
                            icon: EyeOff,
                            title: "Anonymous Claims",
                            description: "Recipients prove eligibility with ZK proofs without revealing their identity.",
                            color: "violet"
                        },
                        {
                            icon: Lock,
                            title: "Private Recipient Lists",
                            description: "Only the merkle root is stored on-chain. Your full list stays private.",
                            color: "fuchsia"
                        },
                        {
                            icon: Zap,
                            title: "ZK Compression",
                            description: "Up to 1000x cheaper storage using Light Protocol's compressed accounts.",
                            color: "cyan"
                        },
                    ].map((feature, i) => (
                        <div
                            key={i}
                            className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] hover:border-white/10 transition-all group"
                        >
                            <div className={`w-12 h-12 rounded-xl bg-${feature.color}-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                                <feature.icon className={`w-6 h-6 text-${feature.color}-400`} />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                            <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
                        </div>
                    ))}
                </div>

                {/* Stats */}
                <div className="flex flex-wrap justify-center gap-12 mt-24 pt-12 border-t border-white/5">
                    {[
                        { value: "1000x", label: "Cheaper Storage" },
                        { value: "100%", label: "Private Claims" },
                        { value: "1M+", label: "Recipients Scale" },
                    ].map((stat, i) => (
                        <div key={i} className="text-center">
                            <div className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                                {stat.value}
                            </div>
                            <div className="text-gray-500 text-sm mt-1">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function CreateAirdrop({ balance }: { balance: number | null }) {
    const [step, setStep] = useState(1);
    const [recipients, setRecipients] = useState("");
    const [tokenAmount, setTokenAmount] = useState("");
    const [campaignName, setCampaignName] = useState("");
    const [vestingEnabled, setVestingEnabled] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [campaignAddress, setCampaignAddress] = useState("");
    const [txSignature, setTxSignature] = useState("");
    const { publicKey, program } = useShadowDrop();

    const recipientCount = recipients.split("\n").filter(r => r.trim()).length;

    // Check for potential truncated addresses (common mistake copying from UI)
    const hasTruncatedAddresses = useMemo(() => {
        return recipients.split("\n").some(line => {
            const parts = line.split(",");
            const addr = parts[0].trim();
            // Sol addresses are ~32-44 chars. If it's short (like 10-15) and has "..." or just looks very short, it's suspicious.
            return addr.length > 0 && addr.length < 32;
        });
    }, [recipients]);

    // Auto-calculate total amount
    useEffect(() => {
        const total = recipients.split("\n").reduce((acc, line) => {
            const parts = line.split(",");
            if (parts.length > 1) {
                const amount = parseFloat(parts[1].trim());
                return acc + (isNaN(amount) ? 0 : amount);
            }
            return acc;
        }, 0);
        setTokenAmount(total > 0 ? total.toString() : "");
    }, [recipients]);

    const handleCreate = async () => {
        setLoading(true);
        try {
            if (!publicKey || !program) throw new Error("Wallet not connected");

            console.log("Creating campaign:", { campaignName, recipientCount, tokenAmount });

            const amountToSend = parseFloat(tokenAmount || "0");

            // Check balance (need extra for rent)
            const rentBuffer = 0.01; // ~0.01 SOL for account rent
            if (balance === null || amountToSend + rentBuffer > balance) {
                alert(`Insufficient balance! You have ${balance?.toFixed(4) || 0} SOL but need ${(amountToSend + rentBuffer).toFixed(4)} SOL.`);
                throw new Error("Insufficient balance");
            }

            // Parse recipients from textarea
            const recipientList = recipients.split("\n")
                .filter(r => r.trim())
                .map(r => {
                    const [address, amount] = r.split(",");
                    return { wallet: address.trim(), amount: parseFloat(amount?.trim() || "0") };
                });

            // Import PDA helpers
            const { deriveCampaignPDA, deriveVaultPDA, generateCampaignId, generateMerkleRoot } = await import("../lib/pda");

            // Generate unique campaign ID
            const campaignId = generateCampaignId();

            // Derive PDAs
            const [campaignPDA] = deriveCampaignPDA(publicKey, campaignId);
            const [vaultPDA] = deriveVaultPDA(publicKey, campaignId);

            // Generate merkle root from recipients
            const merkleRoot = generateMerkleRoot(recipientList);

            // Convert amount to lamports
            const lamports = new BN(Math.floor(amountToSend * LAMPORTS_PER_SOL));

            // Call smart contract create_campaign instruction
            const tx = await program.methods
                .createCampaign(campaignId, Array.from(merkleRoot), lamports)
                .accounts({
                    authority: publicKey,
                    campaign: campaignPDA,
                    vault: vaultPDA,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("Transaction signature:", tx);
            setTxSignature(tx);

            // Use campaign PDA as the address
            const campaignAddress = campaignPDA.toBase58();
            setCampaignAddress(campaignAddress);

            // Save to backend API for off-chain data (recipient list)
            const { createCampaign } = await import("../lib/api");
            await createCampaign({
                address: campaignAddress,
                name: campaignName,
                merkle_root: Buffer.from(merkleRoot).toString('hex'),
                total_amount: amountToSend,
                creator_wallet: publicKey.toBase58(),
                tx_signature: tx,
                vault_address: vaultPDA.toBase58(), // Store vault for claims
                recipients: recipientList,
            });

            console.log("Campaign created on-chain and saved to backend");
            setSuccess(true);
        } catch (error: any) {
            console.error("Transaction failed:", error);
            if (error?.toString().includes("User rejected")) {
                alert("Transaction rejected by user.");
            } else {
                alert("Transaction failed! " + (error?.message || error?.toString()));
            }
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="max-w-2xl mx-auto">
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-8 text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Airdrop Created!</h2>
                    <p className="text-gray-400 mb-6">Your private airdrop campaign is now live.</p>

                    <div className="bg-black/40 rounded-xl p-4 mb-6">
                        <div className="text-sm text-gray-500 mb-1">Campaign Address</div>
                        <div className="flex items-center justify-center gap-2">
                            <code className="text-violet-400 font-mono">{campaignAddress.substring(0, 8)}...{campaignAddress.substring(campaignAddress.length - 8)}</code>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(campaignAddress);
                                    alert("Address copied!");
                                }}
                                className="text-gray-500 hover:text-white transition-colors"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="p-3 bg-white/[0.02] rounded-xl">
                            <div className="text-2xl font-bold text-white">{recipientCount}</div>
                            <div className="text-xs text-gray-500">Recipients</div>
                        </div>
                        <div className="p-3 bg-white/[0.02] rounded-xl">
                            <div className="text-2xl font-bold text-white">{tokenAmount}</div>
                            <div className="text-xs text-gray-500">SOL Total</div>
                        </div>
                        <div className="p-3 bg-white/[0.02] rounded-xl">
                            <div className="text-2xl font-bold text-emerald-400">Active</div>
                            <div className="text-xs text-gray-500">Status</div>
                        </div>
                    </div>

                    <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl mb-6">
                        <div className="flex items-start gap-3 text-left">
                            <Lock className="w-5 h-5 text-violet-400 mt-0.5" />
                            <div>
                                <div className="font-medium text-violet-300">Merkle Root Stored</div>
                                <div className="text-sm text-violet-400/70 mt-1">
                                    Only the merkle root is on-chain. Recipients can share the campaign address to claim.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={() => {
                                setSuccess(false);
                                setStep(1);
                                setRecipients("");
                                setTokenAmount("");
                                setCampaignName("");
                            }}
                            className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-4 rounded-xl transition-all"
                        >
                            Create Another
                        </button>
                        <a
                            href={`https://explorer.solana.com/tx/${txSignature}?cluster=custom&customUrl=http://localhost:8899`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                            <ExternalLink className="w-4 h-4" />
                            View on Explorer
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 mb-12">
                {[
                    { num: 1, label: "Recipients" },
                    { num: 2, label: "Settings" },
                    { num: 3, label: "Review" },
                ].map((s, i) => (
                    <div key={s.num} className="flex items-center">
                        <button
                            onClick={() => setStep(s.num)}
                            className={`flex items-center gap-3 px-4 py-2 rounded-full transition-all ${step >= s.num
                                ? "bg-violet-500/20 text-violet-300"
                                : "bg-white/5 text-gray-500"
                                }`}
                        >
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${step > s.num ? "bg-violet-500 text-white" : step === s.num ? "bg-violet-500/50 text-white" : "bg-white/10"
                                }`}>
                                {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                            </span>
                            <span className="font-medium">{s.label}</span>
                        </button>
                        {i < 2 && <div className={`w-12 h-0.5 mx-2 ${step > s.num ? "bg-violet-500" : "bg-white/10"}`} />}
                    </div>
                ))}
            </div>

            {/* Step Content */}
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-8">
                {step === 1 && (
                    <div className="space-y-6">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-xl font-bold text-white">Recipients</h2>
                                    <p className="text-gray-400 text-sm">Enter addresses manually or upload a CSV file.</p>
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="file"
                                        accept=".csv,.txt"
                                        id="csv-upload"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (event) => {
                                                    const text = event.target?.result as string;
                                                    setRecipients(text);
                                                };
                                                reader.readAsText(file);
                                            }
                                        }}
                                    />
                                    <label
                                        htmlFor="csv-upload"
                                        className="flex items-center gap-2 px-4 py-2 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 text-violet-300 rounded-lg cursor-pointer transition-colors text-sm font-medium"
                                    >
                                        <Upload className="w-4 h-4" />
                                        Import CSV
                                    </label>
                                </div>
                            </div>

                            <div className="relative group">
                                <div className="absolute top-0 bottom-0 left-0 w-10 bg-black/20 border-r border-white/5 rounded-l-xl flex flex-col items-center pt-4 text-xs text-gray-600 font-mono select-none pointer-events-none">
                                    {Array.from({ length: 12 }).map((_, i) => (
                                        <div key={i} className="h-6">{i + 1}</div>
                                    ))}
                                </div>
                                <textarea
                                    value={recipients}
                                    onChange={(e) => setRecipients(e.target.value)}
                                    placeholder="wallet1address, 1.5&#10;wallet2address, 0.5&#10;wallet3address, 2.0"
                                    className="w-full h-72 bg-black/40 border border-white/10 rounded-xl pl-14 pr-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 font-mono text-sm resize-none leading-6"
                                    spellCheck={false}
                                />
                            </div>

                            <div className="flex items-center justify-between mt-3 text-sm">
                                <div className="flex items-center gap-4">
                                    <div className={`flex items-center gap-2 px-2 py-1 rounded-md border ${hasTruncatedAddresses
                                        ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                                        : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                                        }`}>
                                        {hasTruncatedAddresses ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                        <span className="font-mono text-xs">{recipientCount} VALID</span>
                                    </div>
                                    <span className="text-gray-500 text-xs">
                                        Format: address, amount
                                    </span>
                                </div>
                                <span className="text-gray-500 flex items-center gap-1.5">
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>Encrypted & Private</span>
                                </span>
                            </div>

                            {hasTruncatedAddresses && (
                                <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                                    <div className="text-xs text-amber-200">
                                        <strong>Warning:</strong> Some addresses look too short.
                                        Did you copy a truncated address (e.g. <code>7WF...Je6r</code>) from a UI?
                                        Please use full addresses.
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setStep(2)}
                            disabled={recipientCount === 0}
                            className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                            Continue
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2">Campaign Settings</h2>
                            <p className="text-gray-400">Configure your airdrop parameters.</p>
                        </div>

                        <div className="grid gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Campaign Name
                                </label>
                                <input
                                    type="text"
                                    value={campaignName}
                                    onChange={(e) => setCampaignName(e.target.value)}
                                    placeholder="My Private Airdrop"
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Total Token Amount (Auto-Calculated)
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={tokenAmount}
                                        readOnly
                                        disabled
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 pr-20 text-gray-400 cursor-not-allowed placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">SOL</span>
                                </div>
                            </div>

                            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Clock className="w-5 h-5 text-violet-400" />
                                        <div>
                                            <div className="font-medium text-white">Token Vesting</div>
                                            <div className="text-sm text-gray-500">Release tokens over time</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setVestingEnabled(!vestingEnabled)}
                                        className={`w-12 h-6 rounded-full transition-all ${vestingEnabled ? "bg-violet-500" : "bg-white/10"}`}
                                    >
                                        <div className={`w-5 h-5 bg-white rounded-full transition-transform ${vestingEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setStep(1)}
                                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-4 rounded-xl transition-all"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => setStep(3)}
                                disabled={!campaignName || !tokenAmount}
                                className="flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                Continue
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2">Review & Launch</h2>
                            <p className="text-gray-400">Confirm your airdrop details before launching.</p>
                        </div>

                        <div className="space-y-4">
                            <div className="p-4 bg-black/40 rounded-xl border border-white/5">
                                <div className="text-sm text-gray-500 mb-1">Campaign Name</div>
                                <div className="text-lg font-medium text-white">{campaignName}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-black/40 rounded-xl border border-white/5">
                                    <div className="text-sm text-gray-500 mb-1">Recipients</div>
                                    <div className="text-lg font-medium text-white">{recipientCount}</div>
                                </div>
                                <div className="p-4 bg-black/40 rounded-xl border border-white/5">
                                    <div className="text-sm text-gray-500 mb-1">Total Amount</div>
                                    <div className="text-lg font-medium text-white">{tokenAmount} SOL</div>
                                </div>
                            </div>

                            <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                                <div className="flex items-start gap-3">
                                    <Lock className="w-5 h-5 text-violet-400 mt-0.5" />
                                    <div>
                                        <div className="font-medium text-violet-300">Privacy Guaranteed</div>
                                        <div className="text-sm text-violet-400/70 mt-1">
                                            Only the merkle root will be stored on-chain. Recipients can claim anonymously using ZK proofs.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setStep(2)}
                                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-4 rounded-xl transition-all"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={loading}
                                className="flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <span className="animate-pulse">Creating Campaign...</span>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        Launch Airdrop
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function ClaimAirdrop() {
    const [campaignId, setCampaignId] = useState("");
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);
    const [eligible, setEligible] = useState<boolean | null>(null);
    const [success, setSuccess] = useState(false);
    const [lastTx, setLastTx] = useState("");
    const { publicKey, program } = useShadowDrop();

    const [claimAmount, setClaimAmount] = useState<number>(0);

    const handleCheck = async () => {
        setChecking(true);
        try {
            if (!publicKey) {
                setEligible(false);
                setChecking(false);
                return;
            }

            // Check eligibility via backend API
            const { checkEligibility } = await import("../lib/api");
            const result = await checkEligibility(campaignId.trim(), publicKey.toBase58());

            console.log("Eligibility result:", result);

            if (result.already_claimed) {
                alert("You have already claimed from this campaign!");
                setEligible(false);
                setClaimAmount(0);
            } else if (result.eligible && result.amount) {
                setEligible(true);
                setClaimAmount(result.amount);
            } else {
                setEligible(false);
                setClaimAmount(0);
            }
        } catch (e: any) {
            console.error(e);
            if (e?.message?.includes("not found")) {
                alert("Campaign not found! Please check the address.");
            }
            setEligible(false);
        } finally {
            setChecking(false);
        }
    };

    const handleClaim = async () => {
        setLoading(true);
        try {
            if (!program || !publicKey) throw new Error("Wallet not connected");

            // Get campaign data from backend (includes vault_address)
            const { getCampaign } = await import("../lib/api");
            const campaignData = await getCampaign(campaignId.trim());

            if (!campaignData) {
                throw new Error("Campaign not found");
            }

            // Campaign address IS the campaign PDA
            const campaignPDA = new PublicKey(campaignId.trim());

            // Get vault address from backend (stored during creation)
            if (!campaignData.vault_address) {
                throw new Error("Vault address not found in campaign data. This campaign may have been created with an older version.");
            }
            const vaultAddress = new PublicKey(campaignData.vault_address);

            // Derive claim_record PDA
            const { deriveClaimRecordPDA } = await import("../lib/pda");
            const [claimRecordPDA] = deriveClaimRecordPDA(campaignPDA, publicKey);

            // Convert amount to lamports
            const lamportsAmount = new BN(Math.floor(claimAmount * LAMPORTS_PER_SOL));

            // Call smart contract claim instruction
            const tx = await program.methods
                .claim(lamportsAmount)
                .accounts({
                    claimer: publicKey,
                    campaign: campaignPDA,
                    vault: vaultAddress,
                    claimRecord: claimRecordPDA,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("Claim tx:", tx);

            // Mark as claimed in backend
            const { markClaimed } = await import("../lib/api");
            await markClaimed(campaignId.trim(), publicKey.toBase58());

            setLastTx(tx);
            setSuccess(true);
            setEligible(null);
            setCampaignId("");
        } catch (error: any) {
            console.error("Claim error:", error);
            if (error?.toString().includes("User rejected")) {
                alert("Claim cancelled by user.");
            } else if (error?.toString().includes("already been processed") || error?.toString().includes("AlreadyClaimed")) {
                alert("You have already claimed from this campaign!");
            } else {
                alert("Claim failed: " + (error?.message || error?.toString()));
            }
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="max-w-2xl mx-auto">
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-8 text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Claim Successful!</h2>
                    <p className="text-gray-400 mb-6">Your tokens have been anonymously transferred to your wallet.</p>

                    <div className="bg-black/40 rounded-xl p-4 mb-6 inline-block">
                        <div className="text-sm text-gray-500 mb-1">Transaction Signature</div>
                        <a
                            href={`https://explorer.solana.com/tx/${lastTx}?cluster=custom&customUrl=http://localhost:8899`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 text-violet-400 hover:text-violet-300 transition-colors"
                        >
                            <code className="font-mono">{lastTx.substring(0, 8)}...{lastTx.substring(lastTx.length - 8)}</code>
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    </div>

                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-8">
                        <div className="flex items-center gap-3 justify-center text-emerald-300">
                            <Lock className="w-5 h-5" />
                            <span className="font-medium">Privacy Preserved (ZK Proof Verified)</span>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            setSuccess(false);
                            setChecking(false);
                        }}
                        className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-3 rounded-xl transition-all"
                    >
                        Claim Another
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto">
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-8">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Zap className="w-8 h-8 text-violet-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Claim Airdrop</h2>
                    <p className="text-gray-400">Check your eligibility and claim tokens anonymously.</p>
                </div>

                <div className="space-y-6">
                    <div className="p-4 bg-violet-500/5 border border-violet-500/10 rounded-xl">
                        <div className="flex items-start gap-3">
                            <EyeOff className="w-5 h-5 text-violet-400 mt-0.5" />
                            <div>
                                <div className="font-medium text-violet-300">Anonymous Claim</div>
                                <div className="text-sm text-violet-400/70 mt-1">
                                    Your claim is private. The campaign creator cannot see who claimed.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            Campaign Address
                        </label>
                        <input
                            type="text"
                            value={campaignId}
                            onChange={(e) => setCampaignId(e.target.value)}
                            placeholder="Enter campaign address..."
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 font-mono"
                        />
                    </div>

                    {eligible !== null && (
                        <div className={`p-4 rounded-xl border ${eligible ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
                            <div className="flex items-center gap-3">
                                {eligible ? (
                                    <>
                                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                        <div>
                                            <div className="font-medium text-emerald-300">You're Eligible!</div>
                                            <div className="text-sm text-emerald-400/70">You can claim {claimAmount} SOL from this airdrop.</div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <Eye className="w-5 h-5 text-red-400" />
                                        <div>
                                            <div className="font-medium text-red-300">Not Eligible</div>
                                            <div className="text-sm text-red-400/70">
                                                Your wallet <code className="bg-black/20 px-1 rounded">{publicKey?.toBase58().substring(0, 6)}...</code> is not in the recipient list.
                                            </div>

                                            {/* Smart Hint for Debugging */}
                                            {(() => {
                                                const campaigns = JSON.parse(localStorage.getItem("shadow_drop_campaigns") || "[]");
                                                const campaign = campaigns.find((c: any) => c.address === campaignId.trim());
                                                const hasShort = campaign?.recipientList?.some((r: any) => r.address.length < 32);

                                                if (hasShort) {
                                                    return (
                                                        <div className="mt-2 text-xs text-amber-400/80 bg-amber-500/10 p-2 rounded">
                                                            <strong>Possible Cause:</strong> The whitelist contains shortened addresses (e.g. "7WF...").
                                                            This usually happens if the creator copied a truncated address.
                                                        </div>
                                                    )
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {eligible === null ? (
                        <button
                            onClick={handleCheck}
                            disabled={checking || !campaignId}
                            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                            {checking ? (
                                <span className="animate-pulse">Checking Eligibility...</span>
                            ) : (
                                <>
                                    <Eye className="w-4 h-4" />
                                    Check Eligibility
                                </>
                            )}
                        </button>
                    ) : eligible ? (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                handleClaim();
                            }}
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <span className="animate-pulse">Generating ZK Proof...</span>
                            ) : (
                                <>
                                    <Zap className="w-4 h-4" />
                                    Claim Anonymously
                                </>
                            )}
                        </button>
                    ) : (
                        <button
                            onClick={() => { setEligible(null); setCampaignId(""); }}
                            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-4 rounded-xl transition-all"
                        >
                            Try Another Campaign
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

import { Check } from "lucide-react";

function ManageCampaigns({ onViewCreate, systemStatus }: { onViewCreate: () => void, systemStatus: 'online' | 'offline' | 'checking' }) {
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [resetConfirm, setResetConfirm] = useState(false);
    const { publicKey } = useShadowDrop();

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(text);
        setTimeout(() => setCopiedId(null), 2000);
    };

    useEffect(() => {
        const fetchCampaigns = async () => {
            if (!publicKey) {
                setLoading(false);
                return;
            }

            try {
                const { getCampaignsByWallet } = await import("../lib/api");
                const data = await getCampaignsByWallet(publicKey.toBase58());
                // Transform to match expected format
                const transformed = data.map(c => ({
                    name: c.name,
                    recipients: c.total_recipients,
                    amount: `${c.total_amount} SOL`,
                    created: new Date(c.created_at).toLocaleDateString(),
                    status: "active",
                    claimed: c.claimed_count,
                    address: c.address,
                }));
                setCampaigns(transformed);
            } catch (e) {
                console.error("Failed to fetch campaigns:", e);
                setCampaigns([]);
            } finally {
                setLoading(false);
            }
        };

        fetchCampaigns();
    }, [publicKey]);

    if (loading) {
        return (
            <div className="text-center py-20 bg-white/[0.02] border border-white/5 rounded-2xl">
                <Loader2 className="w-8 h-8 text-violet-400 mx-auto mb-4 animate-spin" />
                <p className="text-gray-500">Loading campaigns...</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-white">My Campaigns</h2>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (resetConfirm) {
                                localStorage.removeItem("shadow_drop_campaigns");
                                window.location.reload();
                            } else {
                                setResetConfirm(true);
                                setTimeout(() => setResetConfirm(false), 3000);
                            }
                        }}
                        className={`px-4 py-2 font-medium rounded-xl transition-all flex items-center gap-2 border ${resetConfirm
                            ? "bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30"
                            : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white"
                            }`}
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">{resetConfirm ? "Confirm Reset?" : "Reset Data"}</span>
                    </button>
                    <button
                        onClick={onViewCreate}
                        className="px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-medium rounded-xl transition-all flex items-center gap-2"
                    >
                        <Gift className="w-4 h-4" />
                        New Campaign
                    </button>
                </div>
            </div>

            {campaigns.length === 0 ? (
                <div className="text-center py-16 bg-white/[0.02] border border-white/5 rounded-2xl">
                    <Gift className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">No campaigns yet</h3>
                    <p className="text-gray-500 mb-6">Create your first private airdrop</p>
                    <button
                        onClick={onViewCreate}
                        className="px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-medium rounded-xl"
                    >
                        Create Campaign
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {campaigns.map((campaign, i) => (
                        <div key={i} className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-all">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-xl flex items-center justify-center">
                                        <Gift className="w-6 h-6 text-violet-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-white">{campaign.name}</h3>
                                        <div className="text-sm text-gray-500">Created {campaign.created}</div>
                                    </div>
                                </div>
                                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-sm font-medium rounded-full">
                                    Active
                                </span>
                            </div>

                            <div className="grid grid-cols-4 gap-4">
                                <div>
                                    <div className="text-sm text-gray-500">Recipients</div>
                                    <div className="text-lg font-semibold text-white">{campaign.recipients.toLocaleString()}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-500">Claimed</div>
                                    <div className="text-lg font-semibold text-white">{campaign.claimed.toLocaleString()}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-500">Claim Rate</div>
                                    <div className="text-lg font-semibold text-violet-400">
                                        {Math.round((campaign.claimed / campaign.recipients) * 100)}%
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-500">Total Amount</div>
                                    <div className="text-lg font-semibold text-white">{campaign.amount}</div>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-3">
                                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full"
                                        style={{ width: `${(campaign.claimed / campaign.recipients) * 100}%` }}
                                    />
                                </div>


                                <button
                                    onClick={() => handleCopy(campaign.signature || campaign.address)}
                                    className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2"
                                    title="Copy Campaign ID"
                                >
                                    {copiedId === (campaign.signature || campaign.address) ? (
                                        <>
                                            <Check className="w-3 h-3 text-emerald-400" />
                                            <span className="text-emerald-400">Copied</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-3 h-3" />
                                            <span>Start Claim</span>
                                        </>
                                    )}
                                </button>

                                {campaign.signature ? (
                                    <a
                                        href={`https://explorer.solana.com/tx/${campaign.signature}?cluster=custom&customUrl=http://localhost:8899`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                        View Details
                                    </a>
                                ) : (
                                    <button className="px-4 py-2 bg-white/5 text-gray-500 cursor-not-allowed border border-white/5 text-sm font-medium rounded-lg flex items-center gap-2">
                                        <ExternalLink className="w-3 h-3" />
                                        View Details
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )
            }
        </div >
    );
}
