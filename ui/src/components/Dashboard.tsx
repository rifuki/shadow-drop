import { useState, useEffect, useMemo } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useShadowDrop } from "../hooks/useShadowDrop";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import {
    Shield, Zap, EyeOff, Gift, ArrowRight,
    Upload, Clock, CheckCircle2,
    BarChart3, Wallet, Copy, ExternalLink,
    Sparkles, Lock, AlertCircle, Loader2,
    Calendar, ChevronDown
} from "lucide-react";
import { useNetwork } from "../providers/NetworkProvider";


export function Dashboard() {
    const { connected, publicKey, connection } = useShadowDrop();
    const { network, config, setNetwork } = useNetwork();
    const [balance, setBalance] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<"create" | "claim" | "manage">("create");
    const [requestingAirdrop, setRequestingAirdrop] = useState(false);
    const [airdropStatus, setAirdropStatus] = useState<'idle' | 'success'>('idle');
    const [systemStatus, setSystemStatus] = useState<'online' | 'offline' | 'checking'>('checking');
    const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);

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
            alert("Airdrop request failed. If on Devnet, try using the official faucet at faucet.solana.com. Error: " + e);
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
                                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 cursor-pointer ${activeTab === tab.id
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
                                {/* Network Switcher */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
                                        className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full transition-all cursor-pointer ${network === "localnet"
                                            ? "bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20"
                                            : "bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20"
                                            }`}
                                    >
                                        <div className={`w-2 h-2 rounded-full animate-pulse ${network === "localnet" ? "bg-emerald-500" : "bg-cyan-500"
                                            }`} />
                                        <span className={`text-xs font-medium ${network === "localnet" ? "text-emerald-400" : "text-cyan-400"
                                            }`}>
                                            {config.name}
                                        </span>
                                        <ChevronDown className={`w-3 h-3 transition-transform ${showNetworkDropdown ? "rotate-180" : ""
                                            } ${network === "localnet" ? "text-emerald-400" : "text-cyan-400"}`} />
                                    </button>

                                    {/* Dropdown */}
                                    {showNetworkDropdown && (
                                        <div className="absolute top-full mt-2 right-0 w-48 bg-[#12121a] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                                            <button
                                                onClick={() => {
                                                    setNetwork("localnet");
                                                    setShowNetworkDropdown(false);
                                                }}
                                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${network === "localnet"
                                                    ? "bg-emerald-500/10 text-emerald-300"
                                                    : "hover:bg-white/5 text-gray-400"
                                                    }`}
                                            >
                                                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                                                <div>
                                                    <div className="text-sm font-medium">Localnet</div>
                                                    <div className="text-xs text-gray-500">localhost:8899</div>
                                                </div>
                                                {network === "localnet" && <CheckCircle2 className="w-4 h-4 ml-auto" />}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setNetwork("devnet");
                                                    setShowNetworkDropdown(false);
                                                }}
                                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${network === "devnet"
                                                    ? "bg-cyan-500/10 text-cyan-300"
                                                    : "hover:bg-white/5 text-gray-400"
                                                    }`}
                                            >
                                                <div className="w-2 h-2 bg-cyan-500 rounded-full" />
                                                <div>
                                                    <div className="text-sm font-medium">Devnet</div>
                                                    <div className="text-xs text-gray-500">Solana Devnet</div>
                                                </div>
                                                {network === "devnet" && <CheckCircle2 className="w-4 h-4 ml-auto" />}
                                            </button>
                                        </div>
                                    )}
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

// Random campaign name generator
const generateCampaignName = () => {
    const adjectives = ["Genesis", "Cosmic", "Shadow", "Quantum", "Stellar", "Aurora", "Phoenix", "Velocity", "Nexus", "Eclipse", "Omega", "Prime", "Alpha", "Nova", "Zenith"];
    const nouns = ["Drop", "Wave", "Storm", "Launch", "Surge", "Blast", "Boost", "Rush", "Flow", "Spark", "Rise", "Pulse", "Flash", "Burst", "Strike"];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj} ${noun}`;
};

function CreateAirdrop({ balance }: { balance: number | null }) {
    const [step, setStep] = useState(0);
    const [airdropType, setAirdropType] = useState<"instant" | "vested" | null>(null);
    const [recipients, setRecipients] = useState("");
    const [tokenAmount, setTokenAmount] = useState("");
    const [campaignName, setCampaignName] = useState("");
    const [vestingEnabled, setVestingEnabled] = useState(false);
    const [vestingStartNow, setVestingStartNow] = useState(true);
    const [vestingCliffDays, setVestingCliffDays] = useState("");
    const [vestingDurationDays, setVestingDurationDays] = useState("");
    const [vestingFrequency, setVestingFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [campaignAddress, setCampaignAddress] = useState("");
    const [txSignature, setTxSignature] = useState("");
    // Token selection state
    const [tokenType, setTokenType] = useState<"sol" | "spl">("spl");
    const [tokenMint, setTokenMint] = useState("");
    const [tokenSymbol, setTokenSymbol] = useState("");
    const [tokenDecimals, setTokenDecimals] = useState(9);
    // Wallet tokens
    const [walletTokens, setWalletTokens] = useState<Array<{ mint: string, name: string, symbol: string, decimals: number, balance: number, uiBalance: string }>>([]);;
    const [loadingTokens, setLoadingTokens] = useState(false);
    const { publicKey, program, connection } = useShadowDrop();

    // Fetch wallet token accounts
    useEffect(() => {
        if (!publicKey || !connection) return;

        const fetchTokens = async () => {
            setLoadingTokens(true);
            try {
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                    publicKey,
                    { programId: TOKEN_PROGRAM_ID }
                );

                const tokensWithoutMetadata = tokenAccounts.value
                    .filter(acc => {
                        const amount = acc.account.data.parsed.info.tokenAmount;
                        return amount.uiAmount > 0; // Only show tokens with balance
                    })
                    .map(acc => {
                        const info = acc.account.data.parsed.info;
                        const mint = info.mint;
                        const decimals = info.tokenAmount.decimals;
                        const balance = info.tokenAmount.amount;
                        const uiBalance = info.tokenAmount.uiAmountString;
                        const shortMint = mint.substring(0, 4) + "..." + mint.substring(mint.length - 4);
                        return {
                            mint,
                            name: shortMint,
                            symbol: shortMint,
                            decimals,
                            balance: parseInt(balance),
                            uiBalance
                        };
                    });

                // Try to fetch metadata from Helius if API key is available
                const heliusApiKey = import.meta.env.VITE_HELIUS_API_KEY;
                if (heliusApiKey && tokensWithoutMetadata.length > 0) {
                    try {
                        const response = await fetch(`https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 'token-metadata',
                                method: 'getAssetBatch',
                                params: {
                                    ids: tokensWithoutMetadata.map(t => t.mint)
                                }
                            })
                        });
                        const data = await response.json();
                        if (data.result) {
                            const metadataMap = new Map();
                            data.result.forEach((asset: any) => {
                                if (asset && asset.id) {
                                    metadataMap.set(asset.id, {
                                        name: asset.content?.metadata?.name || null,
                                        symbol: asset.content?.metadata?.symbol || null
                                    });
                                }
                            });
                            // Merge metadata
                            const tokensWithMetadata = tokensWithoutMetadata.map(token => {
                                const meta = metadataMap.get(token.mint);
                                if (meta) {
                                    return {
                                        ...token,
                                        name: meta.name || token.name,
                                        symbol: meta.symbol || token.symbol
                                    };
                                }
                                return token;
                            });
                            setWalletTokens(tokensWithMetadata);
                            return;
                        }
                    } catch (metaErr) {
                        console.warn("Failed to fetch token metadata from Helius:", metaErr);
                    }
                }

                setWalletTokens(tokensWithoutMetadata);
            } catch (e) {
                console.error("Failed to fetch token accounts", e);
            } finally {
                setLoadingTokens(false);
            }
        };

        fetchTokens();
    }, [publicKey, connection]);

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

            // 1. Check balances based on Token Type
            const rentBuffer = 0.02; // ~0.02 SOL for account rent and fees

            if (tokenType === "sol") {
                // For SOL airdrop: Check SOL balance > amount + rent
                if (balance === null || amountToSend + rentBuffer > balance) {
                    alert(`Insufficient SOL balance! You have ${balance?.toFixed(4) || 0} SOL but need ${(amountToSend + rentBuffer).toFixed(4)} SOL (incl. fees).`);
                    throw new Error("Insufficient balance");
                }
            } else {
                // For SPL Token airdrop:
                // 1. Check SOL balance > rent (for fees)
                if (balance === null || balance < rentBuffer) {
                    alert(`Insufficient SOL for fees! You have ${balance?.toFixed(4) || 0} SOL but need at least ${rentBuffer} SOL for transaction fees.`);
                    throw new Error("Insufficient SOL balance");
                }

                // 2. Check SPL Token balance > amount
                const selectedToken = walletTokens.find(t => t.mint === tokenMint);
                // amountToSend is in user-friendly units (e.g. 50 USDC), balance is raw (e.g. 50000000)
                // BUT walletTokens.balance from our hook seems to be raw amount, while uiBalance is string
                // Let's rely on uiBalance parsing for safety or re-calculate
                const tokenBalance = selectedToken ? parseFloat(selectedToken.uiBalance) : 0;

                if (!selectedToken || amountToSend > tokenBalance) {
                    alert(`Insufficient ${tokenSymbol || "Token"} balance! You have ${tokenBalance.toLocaleString()} ${tokenSymbol} but need ${amountToSend.toLocaleString()}.`);
                    throw new Error("Insufficient token balance");
                }
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

            // Calculate vesting params
            const vestingStartTs = vestingEnabled ? new BN(0) : new BN(0); // 0 = use current time on-chain
            const vestingCliffSeconds = vestingEnabled ? new BN(parseInt(vestingCliffDays || "0") * 86400) : new BN(0);
            const vestingDurationSeconds = vestingEnabled ? new BN(parseInt(vestingDurationDays || "30") * 86400) : new BN(0);

            // Call smart contract instruction based on token type
            let tx;

            if (tokenType === "sol") {
                // SOL Campaign
                tx = await program.methods
                    .createCampaign(
                        campaignId,
                        Array.from(merkleRoot),
                        lamports,
                        vestingStartTs,
                        vestingCliffSeconds,
                        vestingDurationSeconds
                    )
                    .accounts({
                        authority: publicKey,
                        campaign: campaignPDA,
                        vault: vaultPDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
            } else {
                // SPL Token Campaign
                if (!tokenMint) throw new Error("Token mint needed for SPL campaign");

                const mintPubkey = new PublicKey(tokenMint);
                // Get user's ATA
                const userAta = await getAssociatedTokenAddress(mintPubkey, publicKey);
                // Get campaign's vault ATA (owned by campaign PDA)
                const campaignVaultAta = await getAssociatedTokenAddress(mintPubkey, campaignPDA, true);

                // Calculate token amount with decimals
                const tokenAmountBN = new BN(parseFloat(tokenAmount || "0") * Math.pow(10, tokenDecimals));

                tx = await program.methods
                    .createTokenCampaign(
                        campaignId,
                        Array.from(merkleRoot),
                        tokenAmountBN,
                        vestingStartTs,
                        vestingCliffSeconds,
                        vestingDurationSeconds
                    )
                    .accounts({
                        authority: publicKey,
                        campaign: campaignPDA,
                        tokenMint: mintPubkey,
                        tokenVault: campaignVaultAta,
                        authorityTokenAccount: userAta,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
            }

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
                // Vesting params for backend
                airdrop_type: vestingEnabled ? "vested" : "instant",
                vesting_start: Math.floor(Date.now() / 1000),  // Current timestamp as integer
                vesting_cliff_seconds: parseInt(vestingCliffDays || "0") * 86400,
                vesting_duration_seconds: parseInt(vestingDurationDays || "30") * 86400,
                // Token params (only for SPL tokens)
                token_mint: tokenType === "spl" ? tokenMint : undefined,
                token_symbol: tokenType === "spl" ? tokenSymbol : undefined,
                token_decimals: tokenType === "spl" ? tokenDecimals : undefined,
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
        const tokenDisplay = tokenType === "spl" ? (tokenSymbol || "tokens") : "SOL";
        const shareText = `🎁 Claim your airdrop from ${campaignName}!\n\n💰 ${tokenAmount} ${tokenDisplay} available\n📍 Campaign: ${campaignAddress}\n\nClaim at: ${window.location.origin}`;

        return (
            <div className="max-w-3xl mx-auto">
                {/* Confetti-like top decoration */}
                <div className="relative mb-8">
                    <div className="absolute inset-0 flex justify-center">
                        <div className="w-40 h-40 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-full blur-3xl animate-pulse" />
                    </div>
                </div>

                <div className="bg-gradient-to-b from-white/[0.05] to-white/[0.02] border border-white/10 rounded-3xl overflow-hidden">
                    {/* Success Header */}
                    <div className="bg-gradient-to-r from-emerald-500/10 via-violet-500/10 to-fuchsia-500/10 border-b border-white/5 p-8 text-center">
                        <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
                            <CheckCircle2 className="w-12 h-12 text-white" />
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-2">🎉 Airdrop Created Successfully!</h2>
                        <p className="text-gray-400">Your private airdrop campaign is now live and ready for claims</p>
                    </div>

                    {/* Campaign Details */}
                    <div className="p-8">
                        {/* Campaign Name & Type Badge */}
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <div className="text-sm text-gray-500 mb-1">Campaign Name</div>
                                <div className="text-2xl font-bold text-white">{campaignName}</div>
                            </div>
                            <div className={`px-4 py-2 rounded-full font-semibold text-sm ${vestingEnabled
                                ? "bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-300 border border-violet-500/30"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                }`}>
                                {vestingEnabled ? "⏱️ Vested Release" : "⚡ Instant Release"}
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-center">
                                <div className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                                    {tokenAmount}
                                </div>
                                <div className="text-sm text-gray-500 mt-1">{tokenType === "spl" ? tokenSymbol || "Tokens" : "SOL"} Total</div>
                            </div>
                            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-center">
                                <div className="text-3xl font-bold text-white">{recipientCount}</div>
                                <div className="text-sm text-gray-500 mt-1">Recipients</div>
                            </div>
                            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-center">
                                <div className="text-3xl font-bold text-emerald-400">0%</div>
                                <div className="text-sm text-gray-500 mt-1">Claimed</div>
                            </div>
                            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-center">
                                <div className="text-3xl font-bold text-emerald-400">Active</div>
                                <div className="text-sm text-gray-500 mt-1">Status</div>
                            </div>
                        </div>

                        {/* Vesting Schedule (if enabled) */}
                        {vestingEnabled && (
                            <div className="bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 rounded-2xl p-6 mb-8">
                                <div className="flex items-center gap-3 mb-4">
                                    <Clock className="w-5 h-5 text-violet-400" />
                                    <div className="font-semibold text-violet-300">Vesting Schedule</div>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <div className="text-sm text-gray-500 mb-1">Cliff Period</div>
                                        <div className="text-xl font-bold text-white">
                                            {vestingCliffDays || "0"} days
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            No tokens released during this period
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-gray-500 mb-1">Total Duration</div>
                                        <div className="text-xl font-bold text-white">
                                            {vestingDurationDays || "30"} days
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            Linear release after cliff
                                        </div>
                                    </div>
                                </div>
                                {/* Visual Timeline */}
                                <div className="mt-6">
                                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-orange-500 to-violet-500"
                                            style={{
                                                width: `${(parseInt(vestingCliffDays || "0") / parseInt(vestingDurationDays || "30")) * 100}%`
                                            }}
                                        />
                                    </div>
                                    <div className="flex justify-between mt-2 text-xs text-gray-500">
                                        <span>Start</span>
                                        <span>Cliff ({vestingCliffDays || "0"}d)</span>
                                        <span>End ({vestingDurationDays || "30"}d)</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Campaign Address */}
                        <div className="bg-black/40 rounded-2xl p-5 mb-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm text-gray-500 mb-1">Campaign Address</div>
                                    <code className="text-violet-400 font-mono text-lg">
                                        {campaignAddress.substring(0, 12)}...{campaignAddress.substring(campaignAddress.length - 12)}
                                    </code>
                                </div>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(campaignAddress);
                                        alert("Address copied!");
                                    }}
                                    className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
                                >
                                    <Copy className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>
                        </div>

                        {/* Transaction Signature */}
                        <div className="bg-black/40 rounded-2xl p-5 mb-8">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm text-gray-500 mb-1">Transaction Signature</div>
                                    <code className="text-emerald-400 font-mono">
                                        {txSignature.substring(0, 20)}...{txSignature.substring(txSignature.length - 8)}
                                    </code>
                                </div>
                                <a
                                    href={`https://explorer.solana.com/tx/${txSignature}?cluster=custom&customUrl=http://localhost:8899`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
                                >
                                    <ExternalLink className="w-5 h-5 text-gray-400" />
                                </a>
                            </div>
                        </div>

                        {/* Privacy Notice */}
                        <div className="p-5 bg-violet-500/10 border border-violet-500/20 rounded-2xl mb-8">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <Shield className="w-5 h-5 text-violet-400" />
                                </div>
                                <div>
                                    <div className="font-semibold text-violet-300 mb-1">Privacy Protected</div>
                                    <div className="text-sm text-violet-400/70">
                                        Only the merkle root is stored on-chain. Recipient addresses are never revealed publicly.
                                        Share the campaign address with eligible recipients to claim.
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(shareText);
                                    alert("Share text copied to clipboard!");
                                }}
                                className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-4 rounded-xl transition-all"
                            >
                                <Gift className="w-5 h-5" />
                                Copy Share Link
                            </button>
                            <button
                                onClick={() => {
                                    setSuccess(false);
                                    setStep(0);
                                    setAirdropType(null);
                                    setRecipients("");
                                    setTokenAmount("");
                                    setCampaignName("");
                                    setVestingEnabled(false);
                                    setVestingCliffDays("");
                                    setVestingDurationDays("");
                                    // Reset token state
                                    setTokenType("spl");
                                    setTokenMint("");
                                    setTokenSymbol("");
                                    setTokenDecimals(9);
                                }}
                                className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-4 rounded-xl transition-all"
                            >
                                <Sparkles className="w-5 h-5" />
                                Create Another
                            </button>
                            <a
                                href={`https://explorer.solana.com/tx/${txSignature}?cluster=custom&customUrl=http://localhost:8899`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold py-4 rounded-xl transition-all shadow-lg shadow-violet-500/25"
                            >
                                <ExternalLink className="w-5 h-5" />
                                View on Explorer
                            </a>
                        </div>
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
                    { num: 0, label: "Type" },
                    { num: 1, label: "Recipients" },
                    { num: 2, label: "Settings" },
                    { num: 3, label: "Review" },
                ].map((s, i) => (
                    <div key={s.num} className="flex items-center">
                        <button
                            onClick={() => s.num <= step && setStep(s.num)}
                            disabled={s.num > step}
                            className={`flex items-center gap-3 px-4 py-2 rounded-full transition-all ${step >= s.num
                                ? "bg-violet-500/20 text-violet-300"
                                : "bg-white/5 text-gray-500"
                                } ${s.num > step ? "cursor-not-allowed" : "cursor-pointer"}`}
                        >
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${step > s.num ? "bg-violet-500 text-white" : step === s.num ? "bg-violet-500/50 text-white" : "bg-white/10"
                                }`}>
                                {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num + 1}
                            </span>
                            <span className="font-medium hidden sm:inline">{s.label}</span>
                        </button>
                        {i < 3 && <div className={`w-8 h-0.5 mx-2 ${step > s.num ? "bg-violet-500" : "bg-white/10"}`} />}
                    </div>
                ))}
            </div>

            {/* Step Content */}
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-8">
                {/* Step 0: Type Selection */}
                {step === 0 && (
                    <div className="space-y-8">
                        <div className="text-center">
                            <h2 className="text-2xl font-bold text-white mb-2">Choose Airdrop Type</h2>
                            <p className="text-gray-400">Select how you want to distribute tokens to recipients.</p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Instant Airdrop */}
                            <button
                                onClick={() => {
                                    setAirdropType("instant");
                                    setVestingEnabled(false);
                                    setStep(1);
                                }}
                                className={`p-6 rounded-2xl border-2 text-left transition-all hover:bg-white/[0.04] cursor-pointer ${airdropType === "instant"
                                    ? "border-violet-500 bg-violet-500/10"
                                    : "border-white/10 hover:border-white/20"
                                    }`}
                            >
                                <div className="w-12 h-12 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-xl flex items-center justify-center mb-4">
                                    <Zap className="w-6 h-6 text-violet-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-white mb-2">Instant Airdrop</h3>
                                <p className="text-gray-400 text-sm">
                                    Create an airdrop that instantly releases tokens to recipients upon claim.
                                </p>
                            </button>

                            {/* Vested Airdrop */}
                            <button
                                onClick={() => {
                                    setAirdropType("vested");
                                    setVestingEnabled(true);
                                    setStep(1);
                                }}
                                className={`p-6 rounded-2xl border-2 text-left transition-all hover:bg-white/[0.04] cursor-pointer ${airdropType === "vested"
                                    ? "border-violet-500 bg-violet-500/10"
                                    : "border-white/10 hover:border-white/20"
                                    }`}
                            >
                                <div className="w-12 h-12 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                                    <Calendar className="w-6 h-6 text-cyan-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-white mb-2">Vested Airdrop</h3>
                                <p className="text-gray-400 text-sm">
                                    Gradually releases tokens to recipients after a certain period of time.
                                </p>
                            </button>
                        </div>

                        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                            <p className="text-amber-300 text-sm">
                                <strong>Coming Soon:</strong> Public Airdrop (FCFS) and Price-Based Airdrop options.
                            </p>
                        </div>
                    </div>
                )}

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
                            className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
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
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={campaignName}
                                        onChange={(e) => setCampaignName(e.target.value)}
                                        placeholder="My Private Airdrop"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500/50 transition-colors"
                                    />
                                    <button
                                        onClick={() => setCampaignName(generateCampaignName())}
                                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white px-4 rounded-xl transition-all cursor-pointer"
                                        title="Generate Random Name"
                                    >
                                        <Sparkles className="w-5 h-5" />
                                    </button>
                                </div>
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
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 pr-32 text-gray-400 cursor-not-allowed placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                                    />
                                    {/* Token Type Selector */}
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                        <button
                                            onClick={() => {
                                                const newType = tokenType === "sol" ? "spl" : "sol";
                                                setTokenType(newType);
                                                if (newType === "sol") {
                                                    setTokenMint("");
                                                    setTokenSymbol("");
                                                    setTokenDecimals(9);
                                                }
                                            }}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${tokenType === "spl"
                                                ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-500/30"
                                                : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30"
                                                }`}
                                        >
                                            {tokenType === "spl" ? (
                                                <>
                                                    <Sparkles className="w-4 h-4" />
                                                    SPL Token
                                                </>
                                            ) : (
                                                <>
                                                    <div className="w-4 h-4 rounded-full border-2 border-current" />
                                                    SOL
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* SPL Token Configuration (shown when SPL is selected) */}
                            {tokenType === "spl" && (
                                <div className="space-y-4 p-4 bg-fuchsia-500/5 border border-fuchsia-500/20 rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-fuchsia-300 font-medium">
                                            <Sparkles className="w-4 h-4" />
                                            Select Token from Wallet
                                        </div>
                                        {loadingTokens && (
                                            <Loader2 className="w-4 h-4 text-fuchsia-400 animate-spin" />
                                        )}
                                    </div>

                                    {walletTokens.length > 0 ? (
                                        <div className="space-y-2">
                                            {walletTokens.map((token) => (
                                                <button
                                                    key={token.mint}
                                                    onClick={() => {
                                                        setTokenMint(token.mint);
                                                        setTokenSymbol(token.symbol);
                                                        setTokenDecimals(token.decimals);
                                                    }}
                                                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${tokenMint === token.mint
                                                        ? "bg-fuchsia-500/20 border-fuchsia-500/50"
                                                        : "bg-black/20 border-white/10 hover:bg-white/5 hover:border-white/20"
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-gradient-to-br from-fuchsia-500/30 to-violet-500/30 rounded-full flex items-center justify-center">
                                                            <span className="text-sm font-bold text-fuchsia-300">
                                                                {token.symbol.substring(0, 2).toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="font-medium text-white">
                                                                {token.name !== token.symbol ? token.name : token.symbol}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {token.symbol} • {token.decimals} decimals
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-semibold text-white">{token.uiBalance}</div>
                                                        <div className="text-xs text-gray-500">Available</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : loadingTokens ? (
                                        <div className="py-8 text-center text-gray-500">
                                            <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                                            Loading tokens...
                                        </div>
                                    ) : (
                                        <div className="py-8 text-center">
                                            <div className="text-gray-400 mb-2">No SPL tokens found in wallet</div>
                                            <div className="text-xs text-gray-500">
                                                Make sure you have SPL tokens in your connected wallet
                                            </div>
                                        </div>
                                    )}

                                    {tokenMint && (
                                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                            <div className="flex items-center gap-2 text-emerald-300 text-sm">
                                                <CheckCircle2 className="w-4 h-4" />
                                                <span>Selected: <strong>{tokenSymbol}</strong> ({tokenDecimals} decimals)</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}



                            {/* Vesting Configuration (shown when vesting is enabled) */}
                            {vestingEnabled && (
                                <div className="space-y-4 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
                                    <div className="flex items-center gap-2 text-cyan-300 font-medium">
                                        <Calendar className="w-4 h-4" />
                                        Vesting Configuration
                                    </div>

                                    {/* Start Date */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm font-medium text-white">Start upon creation</div>
                                            <div className="text-xs text-gray-500">Vesting begins when the campaign is created</div>
                                        </div>
                                        <button
                                            onClick={() => setVestingStartNow(!vestingStartNow)}
                                            className={`w-12 h-6 rounded-full transition-all ${vestingStartNow ? "bg-cyan-500" : "bg-white/10"}`}
                                        >
                                            <div className={`w-5 h-5 bg-white rounded-full transition-transform ${vestingStartNow ? "translate-x-6" : "translate-x-0.5"}`} />
                                        </button>
                                    </div>

                                    {/* Cliff Period */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">
                                            Cliff Period (days)
                                        </label>
                                        <input
                                            type="number"
                                            value={vestingCliffDays}
                                            onChange={(e) => setVestingCliffDays(e.target.value)}
                                            placeholder="0"
                                            min="0"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">No tokens released until cliff period ends</p>
                                    </div>

                                    {/* Vesting Duration */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">
                                            Vesting Duration (days)
                                        </label>
                                        <input
                                            type="number"
                                            value={vestingDurationDays}
                                            onChange={(e) => setVestingDurationDays(e.target.value)}
                                            placeholder="30"
                                            min="1"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Total time to release all tokens</p>
                                    </div>

                                    {/* Release Frequency */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">
                                            Release Frequency
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(["daily", "weekly", "monthly"] as const).map((freq) => (
                                                <button
                                                    key={freq}
                                                    onClick={() => setVestingFrequency(freq)}
                                                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-all capitalize ${vestingFrequency === freq
                                                        ? "bg-cyan-500 text-white"
                                                        : "bg-white/5 text-gray-400 hover:bg-white/10"
                                                        }`}
                                                >
                                                    {freq}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
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
                                className="flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
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
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm text-gray-500 mb-1">Campaign Name</div>
                                        <div className="text-lg font-medium text-white">{campaignName}</div>
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${airdropType === "vested"
                                        ? "bg-cyan-500/20 text-cyan-300"
                                        : "bg-violet-500/20 text-violet-300"
                                        }`}>
                                        {airdropType === "vested" ? "Vested" : "Instant"}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-black/40 rounded-xl border border-white/5">
                                    <div className="text-sm text-gray-500 mb-1">Recipients</div>
                                    <div className="text-lg font-medium text-white">{recipientCount}</div>
                                </div>
                                <div className="p-4 bg-black/40 rounded-xl border border-white/5">
                                    <div className="text-sm text-gray-500 mb-1">Total Amount</div>
                                    <div className="text-lg font-medium text-white">
                                        {tokenAmount} {tokenType === "spl" ? (tokenSymbol || "Tokens") : "SOL"}
                                    </div>
                                </div>
                            </div>

                            {/* Vesting Schedule (if vested) */}
                            {vestingEnabled && (
                                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                                    <div className="flex items-start gap-3">
                                        <Calendar className="w-5 h-5 text-cyan-400 mt-0.5" />
                                        <div>
                                            <div className="font-medium text-cyan-300">Vesting Schedule</div>
                                            <div className="text-sm text-cyan-400/70 mt-1 space-y-1">
                                                <div>Start: {vestingStartNow ? "Upon creation" : "Custom date"}</div>
                                                {vestingCliffDays && <div>Cliff: {vestingCliffDays} days</div>}
                                                <div>Duration: {vestingDurationDays || "30"} days</div>
                                                <div>Frequency: {vestingFrequency}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

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
    const [loading, setLoading] = useState(false);
    const [claimingId, setClaimingId] = useState<string | null>(null);
    const [eligibleCampaigns, setEligibleCampaigns] = useState<any[]>([]);
    const [fetchingCampaigns, setFetchingCampaigns] = useState(false);
    const [success, setSuccess] = useState(false);
    const [lastTx, setLastTx] = useState("");
    const [lastCampaignName, setLastCampaignName] = useState("");
    const { publicKey, program } = useShadowDrop();

    // Fetch eligible campaigns on mount and when wallet changes
    useEffect(() => {
        const fetchEligible = async () => {
            if (!publicKey) {
                setEligibleCampaigns([]);
                return;
            }

            setFetchingCampaigns(true);
            try {
                const { getEligibleCampaigns } = await import("../lib/api");
                const campaigns = await getEligibleCampaigns(publicKey.toBase58());
                console.log("Eligible campaigns:", campaigns);
                setEligibleCampaigns(campaigns);
            } catch (e) {
                console.error("Failed to fetch eligible campaigns:", e);
                setEligibleCampaigns([]);
            } finally {
                setFetchingCampaigns(false);
            }
        };

        fetchEligible();
    }, [publicKey]);

    const handleClaim = async (campaign: any) => {
        setLoading(true);
        setClaimingId(campaign.address);
        try {
            if (!program || !publicKey) throw new Error("Wallet not connected");

            // Step 1: Generate ZK proof from backend
            console.log("🔐 Generating ZK proof for campaign:", campaign.name);
            const { generateZkProof, markClaimed } = await import("../lib/api");
            const { deriveNullifierRecordPDA, ZK_VERIFIER_PROGRAM_ID } = await import("../lib/pda");

            const proofData = await generateZkProof(campaign.address, publicKey.toBase58());
            console.log("✅ ZK Proof generated:", {
                groth16_proof_length: proofData.groth16_proof.length,
                public_inputs_length: proofData.public_inputs.length,
                nullifier: proofData.nullifier.slice(0, 16) + "...",
                amount: proofData.amount,
            });

            // Campaign address IS the campaign PDA
            const campaignPDA = new PublicKey(campaign.address);

            // Get vault address from campaign data
            if (!campaign.vault_address) {
                throw new Error("Vault address not found in campaign data.");
            }
            const vaultAddress = new PublicKey(campaign.vault_address);

            // Convert hex strings to Uint8Arrays for contract
            const hexToBytes = (hex: string): Uint8Array => {
                const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
                const bytes = new Uint8Array(cleanHex.length / 2);
                for (let i = 0; i < bytes.length; i++) {
                    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
                }
                return bytes;
            };

            // Parse proof data
            const groth16Proof = hexToBytes(proofData.groth16_proof);
            const publicInputs = hexToBytes(proofData.public_inputs);
            const nullifier = hexToBytes(proofData.nullifier);

            console.log("📦 Proof bytes:", {
                groth16_proof_bytes: groth16Proof.length,
                public_inputs_bytes: publicInputs.length,
                nullifier_bytes: nullifier.length,
            });

            // Derive nullifier record PDA
            const [nullifierRecordPDA] = deriveNullifierRecordPDA(campaignPDA, nullifier);
            console.log("🔑 Nullifier Record PDA:", nullifierRecordPDA.toBase58());

            // Use ZK-verified claim
            let tx;
            const claimAmount = new BN(proofData.amount);

            console.log("🔷 Using ZK-verified claim (claimZkSimple)");
            console.log("   ZK Verifier:", ZK_VERIFIER_PROGRAM_ID.toBase58());

            tx = await program.methods
                .claimZkSimple(
                    Array.from(groth16Proof) as any,     // [u8; 256]
                    Array.from(publicInputs) as any,     // [u8; 96]
                    Array.from(nullifier) as any,        // [u8; 32]
                    claimAmount
                )
                .accounts({
                    claimer: publicKey,
                    campaign: campaignPDA,
                    vault: vaultAddress,
                    zkVerifier: ZK_VERIFIER_PROGRAM_ID,
                    nullifierRecord: nullifierRecordPDA,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("✅ ZK Claim tx:", tx);
            console.log("⚡ ZK Proof verified on-chain! Nullifier:", proofData.nullifier.slice(0, 16) + "...");

            // Mark as claimed in backend
            await markClaimed(campaign.address, publicKey.toBase58());

            // Remove from eligible list
            setEligibleCampaigns(prev => prev.filter(c => c.address !== campaign.address));

            setLastTx(tx);
            setLastCampaignName(campaign.name);
            setSuccess(true);
        } catch (error: any) {
            console.error("Claim error:", error);
            if (error?.toString().includes("User rejected")) {
                alert("Claim cancelled by user.");
            } else if (error?.toString().includes("already been processed") || error?.toString().includes("AlreadyClaimed")) {
                alert("You have already claimed from this campaign!");
                // Remove from list
                setEligibleCampaigns(prev => prev.filter(c => c.address !== campaign.address));
            } else if (error?.toString().includes("Failed to generate proof")) {
                alert("Failed to generate ZK proof. You may not be eligible for this campaign.");
            } else {
                alert("Claim failed: " + (error?.message || error?.toString()));
            }
        } finally {
            setLoading(false);
            setClaimingId(null);
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
                    <p className="text-gray-400 mb-2">Your tokens from <span className="text-white font-medium">{lastCampaignName}</span> have been transferred.</p>
                    <p className="text-gray-500 text-sm mb-6">Transfer completed anonymously to your wallet.</p>

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
                        }}
                        className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-3 rounded-xl transition-all"
                    >
                        Back to Airdrops
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
                <div className="w-16 h-16 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Gift className="w-8 h-8 text-violet-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Your Eligible Airdrops</h2>
                <p className="text-gray-400">Airdrops available for your wallet. Claim anonymously with ZK proofs.</p>
            </div>

            {!publicKey ? (
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-12 text-center">
                    <Wallet className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">Connect Your Wallet</h3>
                    <p className="text-gray-500">Connect your wallet to see available airdrops.</p>
                </div>
            ) : fetchingCampaigns ? (
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-12 text-center">
                    <Loader2 className="w-8 h-8 text-violet-400 mx-auto mb-4 animate-spin" />
                    <p className="text-gray-500">Searching for eligible airdrops...</p>
                </div>
            ) : eligibleCampaigns.length === 0 ? (
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-12 text-center">
                    <Gift className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">No Airdrops Available</h3>
                    <p className="text-gray-500 mb-4">You don't have any pending airdrops to claim.</p>
                    <p className="text-gray-600 text-sm">Ask campaign creators to add your wallet address.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="p-4 bg-violet-500/5 border border-violet-500/10 rounded-xl mb-6">
                        <div className="flex items-start gap-3">
                            <EyeOff className="w-5 h-5 text-violet-400 mt-0.5" />
                            <div>
                                <div className="font-medium text-violet-300">Anonymous Claims</div>
                                <div className="text-sm text-violet-400/70 mt-1">
                                    All claims are private. Campaign creators cannot see who claimed.
                                </div>
                            </div>
                        </div>
                    </div>

                    {eligibleCampaigns.map((campaign) => (
                        <div
                            key={campaign.address}
                            className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.04] transition-all"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-xl font-bold text-white">{campaign.name}</h3>
                                    <div className="text-sm text-gray-500">Created {new Date(campaign.created_at).toLocaleDateString()}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-emerald-400">
                                        {campaign.amount} {campaign.token_symbol || "SOL"}
                                    </div>
                                    <div className="text-sm text-gray-500">Available to claim</div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 text-sm text-gray-400">
                                    <span>{campaign.total_recipients} recipients</span>
                                    <span>•</span>
                                    <span>{campaign.total_amount} {campaign.token_symbol || "SOL"} total</span>
                                </div>
                                <button
                                    onClick={() => handleClaim(campaign)}
                                    disabled={loading}
                                    className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                                >
                                    {claimingId === campaign.address ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Claiming...
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="w-4 h-4" />
                                            Claim
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

import { Check } from "lucide-react";

function ManageCampaigns({ onViewCreate, systemStatus: _systemStatus }: { onViewCreate: () => void, systemStatus: 'online' | 'offline' | 'checking' }) {
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);
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
                    amount: c.total_amount,
                    tokenSymbol: c.token_symbol,
                    created: new Date(c.created_at).toLocaleDateString(),
                    status: "active",
                    claimed: c.claimed_count,
                    address: c.address,
                    signature: c.tx_signature,
                    airdrop_type: c.airdrop_type || 'instant',
                    vesting_cliff_seconds: c.vesting_cliff_seconds || 0,
                    vesting_duration_seconds: c.vesting_duration_seconds || 0,
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
                <button
                    onClick={onViewCreate}
                    className="px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-medium rounded-xl transition-all flex items-center gap-2"
                >
                    <Gift className="w-4 h-4" />
                    New Campaign
                </button>
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
                <div className="space-y-6">
                    {campaigns.map((campaign, i) => (
                        <div key={i} className="bg-gradient-to-b from-white/[0.04] to-white/[0.02] border border-white/10 rounded-2xl overflow-hidden hover:border-violet-500/30 transition-all">
                            {/* Header */}
                            <div className="p-6 border-b border-white/5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-2xl flex items-center justify-center">
                                            <Gift className="w-7 h-7 text-violet-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-white">{campaign.name}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-sm text-gray-500">Created {campaign.created}</span>
                                                <span className="text-gray-600">•</span>
                                                <code className="text-xs text-gray-500 font-mono">
                                                    {campaign.address?.substring(0, 8)}...{campaign.address?.substring(campaign.address.length - 6)}
                                                </code>
                                                <button
                                                    onClick={() => handleCopy(campaign.address)}
                                                    className="p-1 hover:bg-white/10 rounded transition-all cursor-pointer"
                                                >
                                                    {copiedId === campaign.address ? (
                                                        <Check className="w-3 h-3 text-emerald-400" />
                                                    ) : (
                                                        <Copy className="w-3 h-3 text-gray-500" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {/* Type Badge */}
                                        <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${campaign.airdrop_type === 'vested'
                                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                            }`}>
                                            {campaign.airdrop_type === 'vested' ? '⏱️ Vested' : '⚡ Instant'}
                                        </span>
                                        {/* Status Badge */}
                                        <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-sm font-medium rounded-lg border border-emerald-500/30">
                                            ✓ Active
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="p-6 grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div className="bg-white/[0.02] rounded-xl p-4 text-center">
                                    <div className="text-2xl font-bold text-white">{campaign.recipients.toLocaleString()}</div>
                                    <div className="text-xs text-gray-500 mt-1">Recipients</div>
                                </div>
                                <div className="bg-white/[0.02] rounded-xl p-4 text-center">
                                    <div className="text-2xl font-bold text-white">{campaign.claimed.toLocaleString()}</div>
                                    <div className="text-xs text-gray-500 mt-1">Claimed</div>
                                </div>
                                <div className="bg-white/[0.02] rounded-xl p-4 text-center">
                                    <div className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                                        {Math.round((campaign.claimed / campaign.recipients) * 100)}%
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">Claim Rate</div>
                                </div>
                                <div className="bg-white/[0.02] rounded-xl p-4 text-center">
                                    <div className="text-2xl font-bold text-white">
                                        {campaign.amount} <span className="text-sm text-gray-400">{campaign.tokenSymbol || "SOL"}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">Total {campaign.tokenSymbol || "SOL"}</div>
                                </div>
                                <div className="bg-white/[0.02] rounded-xl p-4 text-center">
                                    <div className="text-2xl font-bold text-emerald-400">
                                        {(parseFloat(campaign.amount) * (campaign.claimed / campaign.recipients)).toFixed(2)}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">{campaign.tokenSymbol || "SOL"} Distributed</div>
                                </div>
                            </div>

                            {/* Vesting Info (if vested) */}
                            {campaign.airdrop_type === 'vested' && (
                                <div className="mx-6 mb-4 p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Clock className="w-4 h-4 text-violet-400" />
                                        <span className="text-sm font-medium text-violet-300">Vesting Schedule</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="text-gray-500">Cliff:</span>
                                            <span className="ml-2 text-white font-medium">
                                                {Math.floor((campaign.vesting_cliff_seconds || 0) / 86400)} days
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Duration:</span>
                                            <span className="ml-2 text-white font-medium">
                                                {Math.floor((campaign.vesting_duration_seconds || 0) / 86400)} days
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Progress Bar */}
                            <div className="px-6 pb-4">
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all"
                                        style={{ width: `${(campaign.claimed / campaign.recipients) * 100}%` }}
                                    />
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="px-6 pb-6 flex items-center gap-3">
                                <button
                                    onClick={() => handleCopy(campaign.address)}
                                    className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    {copiedId === campaign.address ? (
                                        <>
                                            <Check className="w-4 h-4 text-emerald-400" />
                                            <span className="text-emerald-400">Address Copied!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4" />
                                            <span>Copy Address</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => {
                                        const shareText = `🎁 Claim your airdrop from ${campaign.name}!\n\n💰 ${campaign.amount} available\n📍 Address: ${campaign.address}\n\nClaim at: ${window.location.origin}`;
                                        navigator.clipboard.writeText(shareText);
                                        handleCopy('share_' + campaign.address);
                                    }}
                                    className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                                >
                                    <Gift className="w-4 h-4" />
                                    <span>Share</span>
                                </button>
                                {campaign.signature && (
                                    <a
                                        href={`https://explorer.solana.com/tx/${campaign.signature}?cluster=custom&customUrl=http://localhost:8899`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-4 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-medium rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        <span>Explorer</span>
                                    </a>
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
