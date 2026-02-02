import { useState, useEffect, useMemo } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useShadowDrop } from "../hooks/useShadowDrop";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createInitializeMintInstruction, createAssociatedTokenAccountInstruction, createMintToInstruction, getMinimumBalanceForRentExemptMint, MINT_SIZE } from "@solana/spl-token";
import { createRpc } from '@lightprotocol/stateless.js';
import { createMint as createCompressedMint, mintTo as mintToCompressed } from '@lightprotocol/compressed-token';
import { generateCompressedKeypair } from "../utils/flashWallet";
import { uploadImageToPinata, uploadMetadataToPinata, isPinataConfigured } from "../utils/pinata";
import { createTokenMetadataInstruction, createMetadataJSON } from "../utils/tokenMetadata";
import { Keypair, Transaction } from "@solana/web3.js";
import {
    Shield, Zap, EyeOff, Gift, ArrowRight,
    Upload, Clock, CheckCircle2,
    Wallet, Copy, ExternalLink,
    Sparkles, Lock, AlertCircle, Loader2,
    Calendar, ChevronDown, Coins, X, ChevronRight, Search
} from "lucide-react";
import { useNetwork } from "../providers/NetworkProvider";
import { Toaster, toast } from 'sonner';

// Helper function for formatting token amounts
const formatTokenAmount = (amount: number, decimals: number = 9) => {
    if (!amount) return "0";
    // If amount is extremely large (likely raw units), format it
    // A simple heuristic: if it has more digits than decimals + 2, it's likely raw
    if (amount > 1000000) {
        return (amount / Math.pow(10, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    // Also handle string/number conversion safety if needed, though TS says number
    return Number(amount).toLocaleString(undefined, { maximumFractionDigits: 4 });
};

export function Dashboard() {
    const { connected, publicKey, connection } = useShadowDrop();
    const { network, config, setNetwork } = useNetwork();

    // Removed local formatTokenAmount, moving to module scope
    const [balance, setBalance] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<"create" | "claim" | "manage" | "token">("manage");
    const [requestingAirdrop, setRequestingAirdrop] = useState(false);
    const [airdropStatus, setAirdropStatus] = useState<'idle' | 'success'>('idle');
    const [systemStatus, setSystemStatus] = useState<'online' | 'offline' | 'checking'>('checking');
    const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);
    const [showToolsDropdown, setShowToolsDropdown] = useState(false);

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
            toast.error("Airdrop request failed", {
                description: "If on Devnet, try using the official faucet. Error: " + e
            });
        } finally {
            setRequestingAirdrop(false);
        }
    };

    if (!connected) {
        return <LandingPage />;
    }

    return (
        <div className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-zinc-800">
            {/* Header */}
            <header className="border-b border-zinc-800 bg-[#09090b] sticky top-0 z-50 h-16">
                <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
                    <div className="flex items-center gap-8">
                        <button
                            onClick={() => setActiveTab("manage")}
                            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                        >
                            <Shield className="w-5 h-5 text-zinc-100" />
                            <span className="text-lg font-bold tracking-tight text-white">Shadow Drop</span>
                        </button>

                        {/* Navigation */}
                        <nav className="hidden md:flex items-center gap-1">
                            <button
                                onClick={() => setActiveTab("manage")}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${activeTab === "manage"
                                    ? "text-white bg-zinc-800"
                                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                                    }`}
                            >
                                My Campaigns
                            </button>
                            <button
                                onClick={() => setActiveTab("claim")}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${activeTab === "claim"
                                    ? "text-white bg-zinc-800"
                                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                                    }`}
                            >
                                Claim
                            </button>
                            <button
                                onClick={() => setActiveTab("create")}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${activeTab === "create"
                                    ? "text-white bg-zinc-800"
                                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                                    }`}
                            >
                                Create Airdrop
                            </button>

                            {/* Tools Dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowToolsDropdown(!showToolsDropdown)}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer flex items-center gap-1 ${activeTab === 'token' ? "text-white bg-zinc-800" : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                                        }`}
                                >
                                    Tools <ChevronDown className="w-3 h-3" />
                                </button>

                                {showToolsDropdown && (
                                    <div className="absolute top-full right-0 mt-1 w-48 bg-[#09090b] border border-zinc-800 rounded-lg shadow-xl py-1 z-50">
                                        <button
                                            onClick={() => {
                                                setActiveTab("token");
                                                setShowToolsDropdown(false);
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors flex items-center gap-2"
                                        >
                                            <Coins className="w-4 h-4" />
                                            Create Token
                                        </button>
                                    </div>
                                )}
                            </div>
                        </nav>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* System Status Indicator */}
                        {systemStatus === 'online' ? (
                            <>
                                {/* Network Switcher */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
                                        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md transition-all cursor-pointer hover:bg-zinc-800 border border-transparent hover:border-zinc-800"
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full ${network === "localnet" ? "bg-emerald-500" : "bg-blue-500"
                                            }`} />
                                        <span className="text-sm font-medium text-zinc-300">
                                            {config.name}
                                        </span>
                                        <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${showNetworkDropdown ? "rotate-180" : ""}`} />
                                    </button>

                                    {/* Dropdown */}
                                    {showNetworkDropdown && (
                                        <div className="absolute top-full mt-2 right-0 w-48 bg-[#09090b] border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-50">
                                            <button
                                                onClick={() => {
                                                    setNetwork("localnet");
                                                    setShowNetworkDropdown(false);
                                                }}
                                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${network === "localnet"
                                                    ? "bg-zinc-900 text-white"
                                                    : "hover:bg-zinc-900 text-zinc-400"
                                                    }`}
                                            >
                                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                                <div>
                                                    <div className="text-sm font-medium">Localnet</div>
                                                    <div className="text-xs text-zinc-500">localhost:8899</div>
                                                </div>
                                                {network === "localnet" && <CheckCircle2 className="w-4 h-4 ml-auto" />}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setNetwork("devnet");
                                                    setShowNetworkDropdown(false);
                                                }}
                                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${network === "devnet"
                                                    ? "bg-zinc-900 text-white"
                                                    : "hover:bg-zinc-900 text-zinc-400"
                                                    }`}
                                            >
                                                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                                                <div>
                                                    <div className="text-sm font-medium">Devnet</div>
                                                    <div className="text-xs text-zinc-500">Solana Devnet</div>
                                                </div>
                                                {network === "devnet" && <CheckCircle2 className="w-4 h-4 ml-auto" />}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : systemStatus === 'offline' ? (
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-md">
                                <AlertCircle className="w-3 h-3 text-red-500" />
                                <span className="text-xs text-red-500 font-medium">Offline</span>
                            </div>
                        ) : (
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-md animate-pulse">
                                <span className="text-xs text-zinc-400 font-medium">Connecting...</span>
                            </div>
                        )}

                        {/* Request Airdrop - ONLY ON LOCALNET */}
                        {network === "localnet" && (
                            <button
                                onClick={handleRequestAirdrop}
                                disabled={requestingAirdrop}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all border ${airdropStatus === 'success'
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    : requestingAirdrop
                                        ? "bg-zinc-800 text-zinc-400 border-zinc-700 opacity-50 cursor-wait"
                                        : "bg-zinc-900 hover:bg-zinc-800 text-white border-zinc-800"
                                    }`}
                            >
                                {airdropStatus === 'success' ? (
                                    <span className="flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" /> Sent
                                    </span>
                                ) : requestingAirdrop ? (
                                    "Requesting..."
                                ) : (
                                    "Request SOL"
                                )}
                            </button>
                        )}

                        <WalletMultiButton className="!bg-zinc-100 hover:!bg-white !text-zinc-900 !border-0 !rounded-md !py-2 !px-4 !text-sm !font-medium !h-9 !transition-all" />
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                {activeTab === "create" && <CreateAirdrop balance={balance} />}
                {activeTab === "token" && <TokenCreator />}
                {activeTab === "claim" && <ClaimAirdrop />}
                {activeTab === "manage" && <ManageCampaigns onViewCreate={() => setActiveTab("create")} systemStatus={systemStatus} />}
            </main>
        </div>
    );
}

function LandingPage() {
    return (
        <div className="min-h-screen bg-[#09090b] relative overflow-hidden text-zinc-100 selection:bg-zinc-800">
            {/* Header */}
            <header className="relative z-10 border-b border-zinc-800 bg-[#09090b]">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-white" />
                        <span className="text-xl font-bold text-white tracking-tight">Shadow Drop</span>
                    </div>
                    <WalletMultiButton className="!bg-zinc-100 hover:!bg-white !text-zinc-900 !border-0 !rounded-md !py-2.5 !px-6 !font-semibold !transition-all" />
                </div>
            </header>

            {/* Hero Section */}
            <div className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
                <div className="text-center space-y-8">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full">
                        <Sparkles className="w-4 h-4 text-zinc-400" />
                        <span className="text-sm text-zinc-300 font-medium">Powered by Light Protocol ZK Compression</span>
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold text-white leading-tight tracking-tight">
                        Private Airdrops
                        <br />
                        <span className="text-zinc-400">
                            at Scale
                        </span>
                    </h1>

                    <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                        Launch privacy-preserving airdrops on Solana. Recipients claim anonymously
                        with zero-knowledge proofs. Your recipient list stays private.
                    </p>

                    <div className="flex flex-wrap justify-center gap-4">
                        <WalletMultiButton className="!bg-zinc-100 hover:!bg-white !text-zinc-900 !border-0 !rounded-md !py-3 !px-8 !text-lg !font-semibold !transition-all" />
                        <button className="px-8 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md text-white font-semibold transition-all">
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
                        },
                        {
                            icon: Lock,
                            title: "Private Recipient Lists",
                            description: "Only the merkle root is stored on-chain. Your full list stays private.",
                        },
                        {
                            icon: Zap,
                            title: "ZK Compression",
                            description: "Up to 1000x cheaper storage using Light Protocol's compressed accounts.",
                        },
                    ].map((feature, i) => (
                        <div
                            key={i}
                            className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-all group"
                        >
                            <div className="w-10 h-10 rounded-md bg-zinc-800 flex items-center justify-center mb-4">
                                <feature.icon className="w-5 h-5 text-zinc-100" />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2 tracking-tight">{feature.title}</h3>
                            <p className="text-zinc-400 text-sm leading-relaxed">{feature.description}</p>
                        </div>
                    ))}
                </div>

                {/* Stats */}
                <div className="flex flex-wrap justify-center gap-12 mt-24 pt-12 border-t border-zinc-800">
                    {[
                        { value: "1000x", label: "Cheaper Storage" },
                        { value: "100%", label: "Private Claims" },
                        { value: "1M+", label: "Recipients Scale" },
                    ].map((stat, i) => (
                        <div key={i} className="text-center">
                            <div className="text-4xl font-bold text-white tracking-tight">
                                {stat.value}
                            </div>
                            <div className="text-zinc-500 text-sm mt-1 font-medium">{stat.label}</div>
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
    // Generate random default recipients with amounts 10-1000
    const generateDefaultRecipients = () => {
        const randomAmount = Math.floor(Math.random() * 991) + 10; // 10-1000
        return `7WF6wgKSbaKarTGs6PLDEAKFPRnie758x4Ya9ukAJe6r,${randomAmount}`;
    };
    const [recipients, setRecipients] = useState(generateDefaultRecipients());
    const [tokenAmount, setTokenAmount] = useState("");
    const [campaignName, setCampaignName] = useState(generateCampaignName());
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
    const [walletTokens, setWalletTokens] = useState<Array<{ mint: string, name: string, symbol: string, decimals: number, balance: number, uiBalance: string, logo?: string }>>([]);;
    const [loadingTokens, setLoadingTokens] = useState(false);
    const [showTokenModal, setShowTokenModal] = useState(false);
    const [tokenSearch, setTokenSearch] = useState("");
    const { publicKey, program, connection } = useShadowDrop();
    const { network } = useNetwork();

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
                console.log("🔍 Helius API Key available:", !!heliusApiKey);
                console.log("🎯 Tokens to fetch metadata for:", tokensWithoutMetadata.map(t => t.mint));

                if (heliusApiKey && tokensWithoutMetadata.length > 0) {
                    try {
                        console.log("📡 Fetching from Helius...");
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

                            // Process assets and try to get logos
                            for (const asset of data.result) {


                                if (asset && asset.id) {
                                    // Try to get logo from various sources
                                    let logo = asset.content?.links?.image ||
                                        asset.content?.json?.image ||
                                        asset.content?.files?.find((f: any) => f.mime?.startsWith('image'))?.uri ||
                                        asset.content?.files?.[0]?.uri || null;

                                    // If no logo and json_uri is base64, decode it to get image
                                    if (!logo && asset.content?.json_uri?.startsWith('data:application/json;base64,')) {
                                        try {
                                            const base64Data = asset.content.json_uri.split(',')[1];
                                            const jsonStr = atob(base64Data);
                                            const jsonData = JSON.parse(jsonStr);

                                            logo = jsonData.image || null;
                                        } catch (decodeErr) {
                                            console.warn("Failed to decode base64 json_uri:", decodeErr);
                                        }
                                    }

                                    // If no logo and json_uri is an external URL, fetch it
                                    if (!logo && asset.content?.json_uri &&
                                        (asset.content.json_uri.startsWith('http') || asset.content.json_uri.startsWith('ipfs'))) {
                                        try {
                                            let fetchUrl = asset.content.json_uri;
                                            // Convert IPFS to gateway URL
                                            if (fetchUrl.startsWith('ipfs://')) {
                                                fetchUrl = fetchUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
                                            }

                                            const metaResponse = await fetch(fetchUrl);
                                            if (metaResponse.ok) {
                                                const metaJson = await metaResponse.json();

                                                logo = metaJson.image || null;
                                                // Convert IPFS image to gateway URL
                                                if (logo?.startsWith('ipfs://')) {
                                                    logo = logo.replace('ipfs://', 'https://ipfs.io/ipfs/');
                                                }
                                            }
                                        } catch (fetchErr) {
                                            console.warn("Failed to fetch external json_uri:", fetchErr);
                                        }
                                    }


                                    metadataMap.set(asset.id, {
                                        name: asset.content?.metadata?.name || null,
                                        symbol: asset.content?.metadata?.symbol || null,
                                        logo: logo
                                    });
                                }
                            }
                            // Merge metadata
                            const tokensWithMetadata = tokensWithoutMetadata.map(token => {
                                const meta = metadataMap.get(token.mint);
                                if (meta) {
                                    return {
                                        ...token,
                                        name: meta.name || token.name,
                                        symbol: meta.symbol || token.symbol,
                                        logo: meta.logo
                                    };
                                }
                                return token;
                            });

                            setWalletTokens(tokensWithMetadata);
                            return;
                        }
                    } catch (metaErr) {
                        console.warn("❌ Failed to fetch token metadata from Helius:", metaErr);
                    }
                }

                // Fallback: Try to fetch from Solana Token List (for known tokens)
                try {
                    const solanaTokenListUrl = 'https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json';
                    const tokenListResponse = await fetch(solanaTokenListUrl);
                    if (tokenListResponse.ok) {
                        const tokenListData = await tokenListResponse.json();
                        const tokenMap = new Map<string, { name: string; symbol: string; logoURI: string }>();
                        tokenListData.tokens?.forEach((t: any) => {
                            tokenMap.set(t.address, { name: t.name, symbol: t.symbol, logoURI: t.logoURI });
                        });

                        const enrichedTokens = tokensWithoutMetadata.map(token => {
                            const meta = tokenMap.get(token.mint);
                            if (meta) {
                                return {
                                    ...token,
                                    name: meta.name || token.name,
                                    symbol: meta.symbol || token.symbol,
                                    logo: meta.logoURI
                                };
                            }
                            return token;
                        });
                        setWalletTokens(enrichedTokens);
                        return;
                    }
                } catch (fallbackErr) {
                    console.warn("Failed to fetch from token list:", fallbackErr);
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
                    toast.error("Insufficient SOL balance!", { description: `You have ${balance?.toFixed(4) || 0} SOL but need ${(amountToSend + rentBuffer).toFixed(4)} SOL (incl. fees).` });
                    throw new Error("Insufficient balance");
                }
            } else {
                // For SPL Token airdrop:
                // 1. Check SOL balance > rent (for fees)
                if (balance === null || balance < rentBuffer) {
                    toast.error("Insufficient SOL for fees!", { description: `You have ${balance?.toFixed(4) || 0} SOL but need at least ${rentBuffer} SOL for transaction fees.` });
                    throw new Error("Insufficient SOL balance");
                }

                // 2. Check SPL Token balance > amount
                const selectedToken = walletTokens.find(t => t.mint === tokenMint);
                // amountToSend is in user-friendly units (e.g. 50 USDC), balance is raw (e.g. 50000000)
                // BUT walletTokens.balance from our hook seems to be raw amount, while uiBalance is string
                // Let's rely on uiBalance parsing for safety or re-calculate
                const tokenBalance = selectedToken ? parseFloat(selectedToken.uiBalance) : 0;

                if (!selectedToken || amountToSend > tokenBalance) {
                    toast.error(`Insufficient ${tokenSymbol || "Token"} balance!`, { description: `You have ${tokenBalance.toLocaleString()} ${tokenSymbol} but need ${amountToSend.toLocaleString()}.` });
                    throw new Error("Insufficient token balance");
                }
            }

            // Parse recipients and convert to BigInt units
            const decimals = tokenType === "sol" ? 9 : tokenDecimals;
            const recipientList = recipients.split("\n")
                .filter(r => r.trim())
                .map(r => {
                    const [address, amount] = r.split(",");
                    const amountNum = parseFloat(amount?.trim() || "0");
                    const amountBn = BigInt(Math.floor(amountNum * Math.pow(10, decimals)));
                    return { wallet: address.trim(), amount: amountBn };
                });

            // Import PDA helpers
            const { deriveCampaignPDA, deriveVaultPDA, generateCampaignId, generateMerkleRoot } = await import("../lib/pda");

            // Generate unique campaign ID
            const campaignId = generateCampaignId();

            // Derive PDAs
            const [campaignPDA] = deriveCampaignPDA(publicKey, campaignId);
            const [vaultPDA] = deriveVaultPDA(publicKey, campaignId);

            // Generate merkle root from recipients
            const merkleRoot = await generateMerkleRoot(recipientList);

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
                total_amount: amountToSend.toString(),
                creator_wallet: publicKey.toBase58(),
                tx_signature: tx,
                vault_address: vaultPDA.toBase58(), // Store vault for claims
                recipients: recipientList.map(r => ({ ...r, amount: r.amount.toString() })),
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
                toast.info("Transaction rejected by user.");
            } else {
                toast.error("Transaction failed!", { description: error?.message || error?.toString() });
            }
        } finally {
            setLoading(false);
        }
    };

    if (success) {


        return (
            <div className="max-w-md mx-auto">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                    {/* Success Header */}
                    <div className="p-8 text-center">
                        <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-1">Campaign Created</h2>
                        <p className="text-zinc-500 text-sm">{campaignName}</p>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-3 border-t border-zinc-800">
                        <div className="p-4 text-center border-r border-zinc-800">
                            <div className="text-xl font-bold text-white">{tokenAmount}</div>
                            <div className="text-xs text-zinc-500">{tokenType === "spl" ? tokenSymbol || "Tokens" : "SOL"}</div>
                        </div>
                        <div className="p-4 text-center border-r border-zinc-800">
                            <div className="text-xl font-bold text-white">{recipientCount}</div>
                            <div className="text-xs text-zinc-500">Recipients</div>
                        </div>
                        <div className="p-4 text-center">
                            <div className="text-xl font-bold text-emerald-400">Active</div>
                            <div className="text-xs text-zinc-500">Status</div>
                        </div>
                    </div>

                    {/* Campaign Address */}
                    <div className="p-4 border-t border-zinc-800">
                        <div className="text-xs text-zinc-500 mb-2">Campaign Address</div>
                        <div className="flex items-center justify-between bg-zinc-950 rounded-lg p-3">
                            <code className="text-violet-400 font-mono text-sm">
                                {campaignAddress.substring(0, 8)}...{campaignAddress.substring(campaignAddress.length - 8)}
                            </code>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(campaignAddress);
                                    toast.success("Copied!");
                                }}
                                className="p-2 hover:bg-zinc-800 rounded-md transition-all"
                            >
                                <Copy className="w-4 h-4 text-zinc-400" />
                            </button>
                        </div>
                        <div className="text-xs text-zinc-600 mt-2">Share this address with eligible recipients to claim</div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-3 p-4 border-t border-zinc-800">
                        <button
                            onClick={() => {
                                setSuccess(false);
                                setStep(0);
                                setAirdropType(null);
                                setRecipients(generateDefaultRecipients());
                                setTokenAmount("");
                                setCampaignName(generateCampaignName());
                                setVestingEnabled(false);
                                setVestingCliffDays("");
                                setVestingDurationDays("");
                                setTokenType("spl");
                                setTokenMint("");
                                setTokenSymbol("");
                                setTokenDecimals(9);
                            }}
                            className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 rounded-lg transition-all text-sm"
                        >
                            <Sparkles className="w-4 h-4" />
                            Create Another
                        </button>
                        <a
                            href={`https://explorer.solana.com/tx/${txSignature}${network === "localnet" ? "?cluster=custom&customUrl=http://localhost:8899" : network === "devnet" ? "?cluster=devnet" : ""}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 bg-white hover:bg-zinc-200 text-zinc-900 font-medium py-3 rounded-lg transition-all text-sm"
                        >
                            <ExternalLink className="w-4 h-4" />
                            Explorer
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
                            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Campaign Settings</h2>
                            <p className="text-zinc-400">Configure your airdrop parameters.</p>
                        </div>

                        <div className="grid gap-6">
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Campaign Name
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={campaignName}
                                        onChange={(e) => setCampaignName(e.target.value)}
                                        placeholder="My Private Airdrop"
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
                                    />
                                    <button
                                        onClick={() => setCampaignName(generateCampaignName())}
                                        className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white px-4 rounded-md transition-all cursor-pointer"
                                        title="Generate Random Name"
                                    >
                                        <Sparkles className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Total Token Amount (Auto-Calculated)
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={tokenAmount}
                                        readOnly
                                        disabled
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-4 pr-32 text-zinc-400 cursor-not-allowed placeholder-zinc-600 focus:outline-none"
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
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${tokenType === "spl"
                                                ? "bg-zinc-800 text-white border border-zinc-700"
                                                : "bg-zinc-800 text-white border border-zinc-700"
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
                                <>
                                    {/* Token Selection Trigger Button */}
                                    <button
                                        onClick={() => setShowTokenModal(true)}
                                        className="w-full p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-all"
                                    >
                                        {tokenMint ? (
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center overflow-hidden border border-zinc-700">
                                                        {walletTokens.find(t => t.mint === tokenMint)?.logo ? (
                                                            <img src={walletTokens.find(t => t.mint === tokenMint)?.logo} alt={tokenSymbol} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="text-sm font-bold text-zinc-400">
                                                                {tokenSymbol.substring(0, 2).toUpperCase()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-left">
                                                        <div className="font-semibold text-white">{tokenSymbol}</div>
                                                        <div className="text-xs text-zinc-500">{tokenDecimals} decimals</div>
                                                    </div>
                                                </div>
                                                <ChevronRight className="w-5 h-5 text-zinc-500" />
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center border border-dashed border-zinc-600">
                                                        <Sparkles className="w-5 h-5 text-zinc-500" />
                                                    </div>
                                                    <div className="text-left">
                                                        <div className="font-medium text-zinc-300">Select Token</div>
                                                        <div className="text-xs text-zinc-500">{walletTokens.length} tokens available</div>
                                                    </div>
                                                </div>
                                                <ChevronRight className="w-5 h-5 text-zinc-500" />
                                            </div>
                                        )}
                                    </button>

                                    {/* Token Selection Modal */}
                                    {showTokenModal && (
                                        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowTokenModal(false)}>
                                            <div
                                                className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden shadow-2xl"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {/* Modal Header */}
                                                <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                                                    <h3 className="text-lg font-semibold text-white">Select a token</h3>
                                                    <button
                                                        onClick={() => setShowTokenModal(false)}
                                                        className="p-1 hover:bg-zinc-800 rounded-md transition-all"
                                                    >
                                                        <X className="w-5 h-5 text-zinc-400" />
                                                    </button>
                                                </div>

                                                {/* Search Box */}
                                                <div className="p-4 border-b border-zinc-800">
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                                        <input
                                                            type="text"
                                                            placeholder="Search by name or symbol"
                                                            value={tokenSearch}
                                                            onChange={(e) => setTokenSearch(e.target.value)}
                                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg py-3 pl-10 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                                                            autoFocus
                                                        />
                                                    </div>
                                                </div>

                                                {/* Token List */}
                                                <div className="overflow-y-auto max-h-[50vh]">
                                                    {loadingTokens ? (
                                                        <div className="py-12 text-center text-zinc-500">
                                                            <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                                                            Loading tokens...
                                                        </div>
                                                    ) : walletTokens.filter(token =>
                                                        token.name.toLowerCase().includes(tokenSearch.toLowerCase()) ||
                                                        token.symbol.toLowerCase().includes(tokenSearch.toLowerCase()) ||
                                                        token.mint.toLowerCase().includes(tokenSearch.toLowerCase())
                                                    ).length > 0 ? (
                                                        <div className="p-2">
                                                            {walletTokens
                                                                .filter(token =>
                                                                    token.name.toLowerCase().includes(tokenSearch.toLowerCase()) ||
                                                                    token.symbol.toLowerCase().includes(tokenSearch.toLowerCase()) ||
                                                                    token.mint.toLowerCase().includes(tokenSearch.toLowerCase())
                                                                )
                                                                .map((token) => (
                                                                    <button
                                                                        key={token.mint}
                                                                        onClick={() => {
                                                                            setTokenMint(token.mint);
                                                                            setTokenSymbol(token.symbol);
                                                                            setTokenDecimals(token.decimals);
                                                                            setShowTokenModal(false);
                                                                            setTokenSearch("");
                                                                        }}
                                                                        className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${tokenMint === token.mint
                                                                            ? "bg-violet-500/10 border border-violet-500/30"
                                                                            : "hover:bg-zinc-800"
                                                                            }`}
                                                                    >
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center overflow-hidden border border-zinc-700">
                                                                                {token.logo ? (
                                                                                    <img src={token.logo} alt={token.symbol} className="w-full h-full object-cover" />
                                                                                ) : (
                                                                                    <span className="text-sm font-bold text-zinc-400">
                                                                                        {token.symbol.substring(0, 2).toUpperCase()}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <div className="text-left">
                                                                                <div className="font-medium text-white">
                                                                                    {token.name !== token.symbol ? token.name : token.symbol}
                                                                                </div>
                                                                                <div className="text-xs text-zinc-500">
                                                                                    {token.symbol} • {token.mint.substring(0, 6)}...{token.mint.substring(token.mint.length - 4)}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <div className="font-semibold text-white">{token.uiBalance}</div>
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                        </div>
                                                    ) : (
                                                        <div className="py-12 text-center">
                                                            <div className="text-zinc-400 mb-2">
                                                                {tokenSearch ? "No tokens found" : "No SPL tokens in wallet"}
                                                            </div>
                                                            <div className="text-xs text-zinc-500">
                                                                {tokenSearch ? "Try a different search term" : "Connect a wallet with tokens"}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}



                            {/* Vesting Configuration (shown when vesting is enabled) */}
                            {vestingEnabled && (
                                <div className="space-y-4 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                                    <div className="flex items-center gap-2 text-zinc-300 font-medium">
                                        <Calendar className="w-4 h-4" />
                                        Vesting Configuration
                                    </div>

                                    {/* Start Date */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm font-medium text-white">Start upon creation</div>
                                            <div className="text-xs text-zinc-500">Vesting begins when the campaign is created</div>
                                        </div>
                                        <button
                                            onClick={() => setVestingStartNow(!vestingStartNow)}
                                            className={`w-10 h-6 rounded-full transition-all ${vestingStartNow ? "bg-white" : "bg-zinc-800"}`}
                                        >
                                            <div className={`w-4 h-4 bg-black rounded-full transition-transform ${vestingStartNow ? "translate-x-5" : "translate-x-1"}`} />
                                        </button>
                                    </div>

                                    {/* Cliff Period */}
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">
                                            Cliff Period (days)
                                        </label>
                                        <input
                                            type="number"
                                            value={vestingCliffDays}
                                            onChange={(e) => setVestingCliffDays(e.target.value)}
                                            placeholder="0"
                                            min="0"
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-3 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                                        />
                                        <p className="text-xs text-zinc-500 mt-1">No tokens released until cliff period ends</p>
                                    </div>

                                    {/* Vesting Duration */}
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">
                                            Vesting Duration (days)
                                        </label>
                                        <input
                                            type="number"
                                            value={vestingDurationDays}
                                            onChange={(e) => setVestingDurationDays(e.target.value)}
                                            placeholder="30"
                                            min="1"
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-3 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                                        />
                                        <p className="text-xs text-zinc-500 mt-1">Total time to release all tokens</p>
                                    </div>

                                    {/* Release Frequency */}
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">
                                            Release Frequency
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(["daily", "weekly", "monthly"] as const).map((freq) => (
                                                <button
                                                    key={freq}
                                                    onClick={() => setVestingFrequency(freq)}
                                                    className={`py-2 px-3 rounded-md text-sm font-medium transition-all capitalize ${vestingFrequency === freq
                                                        ? "bg-zinc-100 text-zinc-900"
                                                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
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
                                className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-medium py-3 rounded-md transition-all"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => setStep(3)}
                                disabled={!campaignName || !tokenAmount}
                                className="flex-1 bg-white hover:bg-zinc-200 text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-3 rounded-md transition-all flex items-center justify-center gap-2 cursor-pointer"
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
                            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Review & Launch</h2>
                            <p className="text-zinc-400">Confirm your airdrop details before launching.</p>
                        </div>

                        <div className="space-y-4">
                            <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm text-zinc-500 mb-1">Campaign Name</div>
                                        <div className="text-lg font-medium text-white">{campaignName}</div>
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${airdropType === "vested"
                                        ? "bg-zinc-800 text-white border border-zinc-700"
                                        : "bg-zinc-800 text-white border border-zinc-700"
                                        }`}>
                                        {airdropType === "vested" ? "Vested" : "Instant"}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
                                    <div className="text-sm text-zinc-500 mb-1">Recipients</div>
                                    <div className="text-lg font-medium text-white">{recipientCount}</div>
                                </div>
                                <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
                                    <div className="text-sm text-zinc-500 mb-1">Total Amount</div>
                                    <div className="text-lg font-medium text-white">
                                        {tokenAmount} {tokenType === "spl" ? (tokenSymbol || "Tokens") : "SOL"}
                                    </div>
                                </div>
                            </div>

                            {/* Vesting Schedule (if vested) */}
                            {vestingEnabled && (
                                <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                                    <div className="flex items-start gap-3">
                                        <Calendar className="w-5 h-5 text-zinc-400 mt-0.5" />
                                        <div>
                                            <div className="font-medium text-white">Vesting Schedule</div>
                                            <div className="text-sm text-zinc-400 mt-1 space-y-1">
                                                <div>Start: {vestingStartNow ? "Upon creation" : "Custom date"}</div>
                                                {vestingCliffDays && <div>Cliff: {vestingCliffDays} days</div>}
                                                <div>Duration: {vestingDurationDays || "30"} days</div>
                                                <div>Frequency: {vestingFrequency}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                                <div className="flex items-start gap-3">
                                    <Lock className="w-5 h-5 text-zinc-400 mt-0.5" />
                                    <div>
                                        <div className="font-medium text-white">Privacy Guaranteed</div>
                                        <div className="text-sm text-zinc-400 mt-1">
                                            Only the merkle root will be stored on-chain. Recipients can claim anonymously using ZK proofs.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setStep(2)}
                                className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-medium py-3 rounded-md transition-all"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={loading}
                                className="flex-1 bg-white hover:bg-zinc-200 text-zinc-900 disabled:opacity-50 font-semibold py-3 rounded-md transition-all flex items-center justify-center gap-2"
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

            if (campaign.token_mint) {
                console.log("🔷 Using Token Claim (claimToken)");
                const mintPubkey = new PublicKey(campaign.token_mint);
                // Derive Token Vault ATA (owned by campaign PDA)
                const campaignVaultAta = await getAssociatedTokenAddress(mintPubkey, campaignPDA, true);

                // Derive User ATA
                const claimerTokenAccount = await getAssociatedTokenAddress(mintPubkey, publicKey);

                // Derive claim_record PDA
                const [claimRecordPDA] = PublicKey.findProgramAddressSync(
                    [Buffer.from("claim"), campaignPDA.toBuffer(), publicKey.toBuffer()],
                    program.programId
                );

                // Use claimToken (legacy) - ZK token claim not yet implemented in contract
                tx = await program.methods
                    .claimToken(claimAmount)
                    .accounts({
                        claimer: publicKey,
                        campaign: campaignPDA,
                        tokenVault: campaignVaultAta,
                        claimerTokenAccount: claimerTokenAccount,
                        tokenMint: mintPubkey,
                        claimRecord: claimRecordPDA,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    })
                    .preInstructions([
                        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
                    ])
                    .rpc();
            } else {
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
                    .preInstructions([
                        // ZK Verification is expensive (~400k+ CU), increase limit to prevent "Program failed to complete"
                        ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 })
                    ])
                    .rpc();
            }

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
                toast.info("Claim cancelled by user.");
            } else if (error?.toString().includes("already been processed") || error?.toString().includes("AlreadyClaimed")) {
                toast.warning("Already Claimed", { description: "You have already claimed from this campaign!" });
                // Remove from list
                setEligibleCampaigns(prev => prev.filter(c => c.address !== campaign.address));
            } else if (error?.toString().includes("Failed to generate proof")) {
                toast.error("Verification Failed", { description: "Failed to generate ZK proof. You may not be eligible for this campaign." });
            } else {
                toast.error("Claim failed", { description: error?.message || error?.toString() });
            }
        } finally {
            setLoading(false);
            setClaimingId(null);
        }
    };

    if (success) {
        return (
            <div className="max-w-2xl mx-auto">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
                    <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Claim Successful!</h2>
                    <p className="text-zinc-400 mb-2">Your tokens from <span className="text-white font-medium">{lastCampaignName}</span> have been transferred.</p>
                    <p className="text-zinc-500 text-sm mb-6">Transfer completed anonymously to your wallet.</p>

                    <div className="bg-zinc-800/50 rounded-md p-4 mb-6 inline-block border border-zinc-700/50">
                        <div className="text-sm text-zinc-500 mb-1">Transaction Signature</div>
                        <a
                            href={`https://explorer.solana.com/tx/${lastTx}?cluster=custom&customUrl=http://localhost:8899`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 text-zinc-300 hover:text-white transition-colors"
                        >
                            <code className="font-mono">{lastTx.substring(0, 8)}...{lastTx.substring(lastTx.length - 8)}</code>
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    </div>

                    <div className="p-4 bg-zinc-900 rounded-md border border-zinc-800 mb-8">
                        <div className="flex items-center gap-2 justify-center text-zinc-400">
                            <Lock className="w-4 h-4" />
                            <span className="font-medium text-sm">Privacy Preserved (ZK Proof Verified)</span>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            setSuccess(false);
                        }}
                        className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-semibold py-3 rounded-md transition-all"
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
                <div className="w-12 h-12 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Gift className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Your Eligible Airdrops</h2>
                <p className="text-zinc-400">Airdrops available for your wallet. Claim anonymously with ZK proofs.</p>
            </div>

            {!publicKey ? (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-12 text-center">
                    <Wallet className="w-10 h-10 text-zinc-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">Connect Your Wallet</h3>
                    <p className="text-zinc-500">Connect your wallet to see available airdrops.</p>
                </div>
            ) : fetchingCampaigns ? (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-12 text-center">
                    <Loader2 className="w-8 h-8 text-zinc-400 mx-auto mb-4 animate-spin" />
                    <p className="text-zinc-500">Searching for eligible airdrops...</p>
                </div>
            ) : eligibleCampaigns.length === 0 ? (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-12 text-center">
                    <Gift className="w-10 h-10 text-zinc-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">No Airdrops Available</h3>
                    <p className="text-zinc-500 mb-4">You don't have any pending airdrops to claim.</p>
                    <p className="text-zinc-600 text-sm">Ask campaign creators to add your wallet address.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg mb-6">
                        <div className="flex items-start gap-3">
                            <EyeOff className="w-5 h-5 text-zinc-400 mt-0.5" />
                            <div>
                                <div className="font-medium text-white">Anonymous Claims</div>
                                <div className="text-sm text-zinc-400 mt-1">
                                    All claims are private. Campaign creators cannot see who claimed.
                                </div>
                            </div>
                        </div>
                    </div>

                    {eligibleCampaigns.map((campaign) => (
                        <div
                            key={campaign.address}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-zinc-700 transition-all"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-xl font-bold text-white tracking-tight">{campaign.name}</h3>
                                    <div className="text-sm text-zinc-500">Created {new Date(campaign.created_at).toLocaleDateString()}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-white tracking-tight">
                                        {formatTokenAmount(campaign.amount, campaign.token_decimals)} <span className="text-zinc-500 text-lg">{campaign.token_symbol || "SOL"}</span>
                                    </div>
                                    <div className="text-sm text-zinc-500">Available to claim</div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 text-sm text-zinc-400">
                                    <span>{campaign.total_recipients} recipients</span>
                                    <span>•</span>
                                    <span>{formatTokenAmount(campaign.total_amount, campaign.token_decimals)} {campaign.token_symbol || "SOL"} total</span>
                                </div>
                                <button
                                    onClick={() => handleClaim(campaign)}
                                    disabled={loading}
                                    className="px-6 py-2 bg-white hover:bg-zinc-200 text-zinc-900 disabled:opacity-50 font-semibold rounded-md transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
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
            <div className="text-center py-20 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                <Loader2 className="w-8 h-8 text-zinc-400 mx-auto mb-4 animate-spin" />
                <p className="text-zinc-500">Loading campaigns...</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-white tracking-tight">My Campaigns</h2>
                <button
                    onClick={onViewCreate}
                    className="px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-900 font-medium rounded-md transition-all flex items-center gap-2"
                >
                    <Gift className="w-4 h-4" />
                    New Campaign
                </button>
            </div>

            {campaigns.length === 0 ? (
                <div className="text-center py-16 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                    <Gift className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">No campaigns yet</h3>
                    <p className="text-zinc-500 mb-6">Create your first private airdrop</p>
                    <button
                        onClick={onViewCreate}
                        className="px-6 py-3 bg-white hover:bg-zinc-200 text-zinc-900 font-medium rounded-md"
                    >
                        Create Campaign
                    </button>
                </div>
            ) : (
                <div className="space-y-6">
                    {campaigns.map((campaign, i) => (
                        <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition-all">
                            {/* Header */}
                            <div className="p-6 border-b border-zinc-800">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center border border-zinc-700">
                                            <Gift className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-white tracking-tight">{campaign.name}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-sm text-zinc-500">Created {campaign.created}</span>
                                                <span className="text-zinc-600">•</span>
                                                <code className="text-xs text-zinc-500 font-mono">
                                                    {campaign.address?.substring(0, 8)}...{campaign.address?.substring(campaign.address.length - 6)}
                                                </code>
                                                <button
                                                    onClick={() => handleCopy(campaign.address)}
                                                    className="p-1 hover:bg-zinc-800 rounded transition-all cursor-pointer"
                                                >
                                                    {copiedId === campaign.address ? (
                                                        <Check className="w-3 h-3 text-emerald-500" />
                                                    ) : (
                                                        <Copy className="w-3 h-3 text-zinc-500" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {/* Type Badge */}
                                        <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${campaign.airdrop_type === 'vested'
                                            ? 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                                            : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                                            }`}>
                                            {campaign.airdrop_type === 'vested' ? '⏱️ Vested' : '⚡ Instant'}
                                        </span>
                                        {/* Status Badge */}
                                        <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-500 text-xs font-medium rounded-md border border-emerald-500/20">
                                            ✓ Active
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="p-6 grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div className="bg-zinc-800/30 rounded-lg p-4 text-center border border-zinc-800">
                                    <div className="text-2xl font-bold text-white tracking-tight">{campaign.recipients.toLocaleString()}</div>
                                    <div className="text-xs text-zinc-500 mt-1">Recipients</div>
                                </div>
                                <div className="bg-zinc-800/30 rounded-lg p-4 text-center border border-zinc-800">
                                    <div className="text-2xl font-bold text-white tracking-tight">{campaign.claimed.toLocaleString()}</div>
                                    <div className="text-xs text-zinc-500 mt-1">Claimed</div>
                                </div>
                                <div className="bg-zinc-800/30 rounded-lg p-4 text-center border border-zinc-800">
                                    <div className="text-2xl font-bold text-white tracking-tight">
                                        {Math.round((campaign.claimed / campaign.recipients) * 100)}%
                                    </div>
                                    <div className="text-xs text-zinc-500 mt-1">Claim Rate</div>
                                </div>
                                <div className="bg-zinc-800/30 rounded-lg p-4 text-center border border-zinc-800">
                                    <div className="text-2xl font-bold text-white tracking-tight">
                                        {campaign.amount} <span className="text-sm text-zinc-500">{campaign.tokenSymbol || "SOL"}</span>
                                    </div>
                                    <div className="text-xs text-zinc-500 mt-1">Total {campaign.tokenSymbol || "SOL"}</div>
                                </div>
                                <div className="bg-zinc-800/30 rounded-lg p-4 text-center border border-zinc-800">
                                    <div className="text-2xl font-bold text-emerald-500 tracking-tight">
                                        {(parseFloat(campaign.amount) * (campaign.claimed / campaign.recipients)).toFixed(2)}
                                    </div>
                                    <div className="text-xs text-zinc-500 mt-1">{campaign.tokenSymbol || "SOL"} Distributed</div>
                                </div>
                            </div>

                            {/* Vesting Info (if vested) */}
                            {campaign.airdrop_type === 'vested' && (
                                <div className="mx-6 mb-4 p-4 bg-zinc-800/30 border border-zinc-800 rounded-lg">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Clock className="w-4 h-4 text-zinc-400" />
                                        <span className="text-sm font-medium text-zinc-300">Vesting Schedule</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="text-zinc-500">Cliff:</span>
                                            <span className="ml-2 text-white font-medium">
                                                {Math.floor((campaign.vesting_cliff_seconds || 0) / 86400)} days
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-zinc-500">Duration:</span>
                                            <span className="ml-2 text-white font-medium">
                                                {Math.floor((campaign.vesting_duration_seconds || 0) / 86400)} days
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Progress Bar */}
                            <div className="px-6 pb-4">
                                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-white rounded-full transition-all"
                                        style={{ width: `${(campaign.claimed / campaign.recipients) * 100}%` }}
                                    />
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="px-6 pb-6 flex items-center gap-3">
                                <button
                                    onClick={() => handleCopy(campaign.address)}
                                    className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-medium rounded-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    {copiedId === campaign.address ? (
                                        <>
                                            <Check className="w-4 h-4 text-emerald-500" />
                                            <span className="text-emerald-500">Address Copied!</span>
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
                                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-medium rounded-md transition-all flex items-center gap-2 cursor-pointer"
                                >
                                    <Gift className="w-4 h-4" />
                                    <span>Share</span>
                                </button>
                                {campaign.signature && (
                                    <a
                                        href={`https://explorer.solana.com/tx/${campaign.signature}?cluster=custom&customUrl=http://localhost:8899`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-900 font-medium rounded-md transition-all flex items-center gap-2 cursor-pointer"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        <span>Explorer</span>
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}

                </div>
            )}
        </div>
    );
}

function TokenCreator() {
    const { connection, publicKey, connected, wallet } = useShadowDrop();
    const [tokenType, setTokenType] = useState<'spl' | 'light'>('spl');
    const [loading, setLoading] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        symbol: '',
        decimals: '9',
        initialSupply: '',
        image: '',
        description: '',
    });



    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Please upload an image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image size must be less than 5MB');
            return;
        }

        if (!isPinataConfigured()) {
            toast.error('Configuration Error', { description: 'Pinata is not configured. Please add VITE_PINATA_JWT to .env file' });
            return;
        }

        try {
            setUploadingImage(true);
            const result = await uploadImageToPinata(file);
            setFormData(prev => ({ ...prev, image: result.gatewayUrl }));

        } catch (error) {
            console.error('Image upload failed:', error);
            toast.error('Failed to upload image');
        } finally {
            setUploadingImage(false);
        }
    };

    const createSPLToken = async () => {
        if (!publicKey || !wallet?.signTransaction) {
            throw new Error('Wallet not connected or does not support signing');
        }

        try {
            const mintKeypair = Keypair.generate();
            const decimals = parseInt(formData.decimals) || 9;
            const initialSupply = formData.initialSupply ? parseFloat(formData.initialSupply) : 0;

            console.log('Creating SPL Token', { name: formData.name, symbol: formData.symbol, decimals, initialSupply, mint: mintKeypair.publicKey.toString() });

            const lamports = await getMinimumBalanceForRentExemptMint(connection);
            const transaction = new Transaction();

            // Step 1: Create mint account
            transaction.add(
                SystemProgram.createAccount({
                    fromPubkey: publicKey,
                    newAccountPubkey: mintKeypair.publicKey,
                    space: MINT_SIZE,
                    lamports,
                    programId: TOKEN_PROGRAM_ID,
                })
            );

            // Step 2: Initialize mint
            transaction.add(
                createInitializeMintInstruction(
                    mintKeypair.publicKey,
                    decimals,
                    publicKey,
                    null,
                    TOKEN_PROGRAM_ID
                )
            );

            // Step 3: Create metadata (if image provided)
            if (formData.name && formData.symbol) {
                let metadataURI = '';

                if (formData.image && isPinataConfigured()) {
                    try {
                        metadataURI = await uploadMetadataToPinata({
                            name: formData.name,
                            symbol: formData.symbol,
                            description: formData.description || `${formData.name} Token`,
                            image: formData.image,
                        });
                    } catch (error) {
                        console.error('Failed to upload metadata to IPFS, using fallback inline JSON', error);
                        const metadataJSON = createMetadataJSON({
                            name: formData.name,
                            symbol: formData.symbol,
                            description: formData.description || `${formData.name} Token`,
                            image: formData.image,
                        });
                        metadataURI = `data:application/json;base64,${btoa(JSON.stringify(metadataJSON))}`;
                    }
                } else {
                    // Fallback/No Pinata
                    const metadataJSON = createMetadataJSON({
                        name: formData.name,
                        symbol: formData.symbol,
                        description: formData.description || `${formData.name} Token`,
                        image: formData.image,
                    });
                    metadataURI = `data:application/json;base64,${btoa(JSON.stringify(metadataJSON))}`;
                }

                if (metadataURI) {
                    const metadataIx = createTokenMetadataInstruction(
                        mintKeypair.publicKey,
                        publicKey,
                        publicKey,
                        publicKey,
                        {
                            name: formData.name,
                            symbol: formData.symbol,
                            uri: metadataURI,
                        }
                    );
                    transaction.add(metadataIx);
                }
            }

            // Step 4: If initial supply, create ATA and mint
            if (initialSupply > 0) {
                const ata = await getAssociatedTokenAddress(mintKeypair.publicKey, publicKey);
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        publicKey,
                        ata,
                        publicKey,
                        mintKeypair.publicKey
                    )
                );
                const amount = BigInt(Math.floor(initialSupply * 10 ** decimals));
                transaction.add(
                    createMintToInstruction(
                        mintKeypair.publicKey,
                        ata,
                        publicKey,
                        amount
                    )
                );
            }

            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;
            transaction.partialSign(mintKeypair);

            const signedTransaction = await wallet.signTransaction!(transaction);
            const signature = await connection.sendRawTransaction(signedTransaction.serialize());

            await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });

            return { mint: mintKeypair.publicKey.toString(), signature };
        } catch (error) {
            console.error('Error creating SPL token:', error);
            throw error;
        }
    };

    const createLightToken = async () => {
        if (!publicKey || !wallet?.signTransaction) {
            throw new Error('Wallet not connected');
        }

        let flashPayer: Keypair | undefined;

        try {
            const decimals = parseInt(formData.decimals) || 9;
            const initialSupply = formData.initialSupply ? parseFloat(formData.initialSupply) : 0;

            console.log('Creating Light Protocol Token (ZK Compressed)...');

            // Step 1: Generate BN254-compatible keypair
            flashPayer = generateCompressedKeypair();

            // Step 2: Fund flash wallet (0.005 SOL safety buffer)
            const fundAmount = 5_000_000;
            const fundTransaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: flashPayer.publicKey,
                    lamports: fundAmount,
                })
            );

            const { blockhash: fundBh, lastValidBlockHeight: fundBhH } = await connection.getLatestBlockhash('confirmed');
            fundTransaction.recentBlockhash = fundBh;
            fundTransaction.feePayer = publicKey;

            const signedFundTx = await wallet.signTransaction!(fundTransaction);
            const fundSig = await connection.sendRawTransaction(signedFundTx.serialize());
            await connection.confirmTransaction({ signature: fundSig, blockhash: fundBh, lastValidBlockHeight: fundBhH });

            // Step 3: Create Light Mint
            const rpcEndpoint = connection.rpcEndpoint;
            // NOTE: Using a simplified RPC creation if possible, or passing explicit connection if lib supports it. 
            // The imported createRpc (from context) might be needed, but here we assume standard connection works for some parts or we create a new Rpc wrapper instance.
            // Adjusting based on standard usage seen in spl-factory-ui which uses createRpc(url, url)
            const rpc = createRpc(rpcEndpoint, rpcEndpoint);

            const { mint, transactionSignature: mintSignature } = await createCompressedMint(
                rpc,
                flashPayer,
                flashPayer.publicKey,
                decimals
            );

            let finalSignature = mintSignature;

            // Step 4: Mint initial supply
            if (initialSupply > 0) {
                const amount = BigInt(Math.floor(initialSupply * 10 ** decimals));
                const mintToSignature = await mintToCompressed(
                    rpc,
                    flashPayer,
                    mint,
                    publicKey, // Mint to user
                    flashPayer,
                    amount
                );
                finalSignature = mintToSignature;
            }

            // Step 5: Refund unused SOL
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for settlement
            const remaining = await connection.getBalance(flashPayer.publicKey);
            const minBuffer = 5000;
            if (remaining > minBuffer) {
                const refundTx = new Transaction().add(
                    SystemProgram.transfer({
                        fromPubkey: flashPayer.publicKey,
                        toPubkey: publicKey,
                        lamports: remaining - minBuffer,
                    })
                );
                const { blockhash: refBh } = await connection.getLatestBlockhash('confirmed');
                refundTx.recentBlockhash = refBh;
                refundTx.feePayer = flashPayer.publicKey;
                refundTx.sign(flashPayer);
                const refundSig = await connection.sendRawTransaction(refundTx.serialize());
                // Don't await confirmStrictly for refund speed perception, just log
                console.log('Refund signature:', refundSig);
            }

            return { mint: mint.toString(), signature: finalSignature };

        } catch (error) {
            console.error('Error creating Light token:', error);
            // Emergency Refund logic
            if (flashPayer) {
                try {
                    const balance = await connection.getBalance(flashPayer.publicKey);
                    if (balance > 5000) {
                        const refundTx = new Transaction().add(
                            SystemProgram.transfer({
                                fromPubkey: flashPayer.publicKey,
                                toPubkey: publicKey,
                                lamports: balance - 5000,
                            })
                        );
                        const { blockhash } = await connection.getLatestBlockhash('confirmed');
                        refundTx.recentBlockhash = blockhash;
                        refundTx.feePayer = flashPayer.publicKey;
                        refundTx.sign(flashPayer);
                        await connection.sendRawTransaction(refundTx.serialize());
                    }
                } catch (e) {
                    console.error('Emergency refund failed', e);
                }
            }
            throw error;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!connected) return;
        setLoading(true);

        try {
            let result;
            if (tokenType === 'spl') {
                result = await createSPLToken();
            } else {
                result = await createLightToken();
            }

            console.log("Token created:", result.mint);
            toast.success("Token Created Successfully!", {
                description: `Mint: ${result.mint}`,
                duration: 10000,
                action: {
                    label: "View",
                    onClick: () => window.open(`https://explorer.solana.com/address/${result.mint}?cluster=devnet`, '_blank')
                }
            });
            setFormData({ name: '', symbol: '', decimals: '9', initialSupply: '', image: '', description: '' });
        } catch (e: any) {
            toast.error("Failed to create token", { description: e.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">Create Token</h2>
                <p className="text-zinc-400">Launch a new SPL or Light Protocol token.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Form Section */}
                <div className="md:col-span-2 space-y-6">
                    {/* Token Type Selector */}
                    <div className="p-1 bg-zinc-900/50 rounded-lg p-1 border border-zinc-800 flex">
                        <button
                            onClick={() => setTokenType('spl')}
                            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${tokenType === 'spl' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`}
                        >
                            <Coins className="w-4 h-4" />
                            Standard SPL Code
                        </button>
                        <button
                            onClick={() => setTokenType('light')}
                            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${tokenType === 'light' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`}
                        >
                            <Zap className="w-4 h-4" />
                            Light Protocol (ZK)
                        </button>
                    </div>

                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1">Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-zinc-700 transition"
                                        placeholder="e.g. Shadow Token"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1">Symbol</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.symbol}
                                        onChange={(e) => handleInputChange('symbol', e.target.value.toUpperCase())}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-zinc-700 transition"
                                        placeholder="e.g. SHDW"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1">Decimals</label>
                                    <input
                                        type="number"
                                        value={formData.decimals}
                                        onChange={(e) => handleInputChange('decimals', e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-zinc-700 transition"
                                        placeholder="9"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1">Initial Supply</label>
                                    <input
                                        type="number"
                                        value={formData.initialSupply}
                                        onChange={(e) => handleInputChange('initialSupply', e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-zinc-700 transition"
                                        placeholder="1000000"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">Image (Optional)</label>
                                <div className="relative group">
                                    {formData.image && !uploadingImage ? (
                                        <div className="flex items-center gap-4 p-4 border-2 border-dashed border-emerald-500/50 bg-emerald-500/5 rounded-lg">
                                            <img
                                                src={formData.image}
                                                alt="Token Preview"
                                                className="w-16 h-16 rounded-md object-cover border border-zinc-700 shadow-sm"
                                            />

                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-emerald-400 flex items-center gap-1.5 mb-1">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    Image Uploaded
                                                </p>
                                                <a
                                                    href={formData.image}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-xs text-zinc-500 hover:text-zinc-300 underline truncate block transition-colors flex items-center gap-1"
                                                >
                                                    {formData.image.length > 40 ? formData.image.substring(0, 35) + '...' : formData.image}
                                                    <ExternalLink className="w-3 h-3 inline" />
                                                </a>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, image: '' }))}
                                                className="p-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-red-400 transition-all border border-transparent hover:border-zinc-700"
                                                title="Remove image"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <label
                                            className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all
                                                ${uploadingImage ? 'border-zinc-700 bg-zinc-900/50 opacity-50 cursor-not-allowed' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50 hover:bg-zinc-900'}
                                            `}
                                        >
                                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                {uploadingImage ? (
                                                    <>
                                                        <Loader2 className="w-8 h-8 mb-2 text-zinc-400 animate-spin" />
                                                        <p className="text-xs text-zinc-400">Uploading to IPFS...</p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload className="w-8 h-8 mb-3 text-zinc-400 group-hover:text-zinc-300 transition-colors" />
                                                        <p className="mb-1 text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
                                                            <span className="font-semibold">Click to upload</span> or drag and drop
                                                        </p>
                                                        <p className="text-xs text-zinc-500">SVG, PNG, JPG or GIF (MAX. 5MB)</p>
                                                    </>
                                                )}
                                            </div>
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept="image/*"
                                                onChange={handleImageUpload}
                                                disabled={uploadingImage}
                                            />
                                        </label>
                                    )}
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || uploadingImage}
                                className="w-full mt-4 bg-zinc-100 text-zinc-900 font-bold py-3 rounded-xl hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                                ) : (
                                    <><Coins className="w-4 h-4" /> Create Token</>
                                )}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Info Sidebar */}
                <div className="space-y-6">
                    <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            {tokenType === 'spl' ? <Coins className="w-5 h-5 text-zinc-400" /> : <Zap className="w-5 h-5 text-yellow-500" />}
                            {tokenType === 'spl' ? 'Standard SPL' : 'Light Protocol'}
                        </h3>
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                            {tokenType === 'spl'
                                ? "The standard for tokens on Solana. Compatible with all wallets, DEXs, and DeFi protocols. Uses Metadata standard for name/logo display."
                                : "ZK Compressed tokens. Extremely cheap minting (~99% cheaper) and scalable. Perfect for massive airdrops. (Note: Metadata display in wallets coming soon)."}
                        </p>

                        <div className="text-xs text-zinc-500 border-t border-zinc-800 pt-4">
                            {tokenType === 'spl' ? (
                                <ul className="space-y-2">

                                    <li className="flex justify-between"><span>Metadata:</span> <span className="text-emerald-400">Supported</span></li>
                                    <li className="flex justify-between"><span>Compatibility:</span> <span className="text-emerald-400">Universal</span></li>
                                </ul>
                            ) : (
                                <ul className="space-y-2">

                                    <li className="flex justify-between"><span>Metadata:</span> <span className="text-yellow-500">Limited</span></li>
                                    <li className="flex justify-between"><span>Tech:</span> <span className="text-zinc-300">ZK Compression</span></li>
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <Toaster />
        </div>
    );
}

