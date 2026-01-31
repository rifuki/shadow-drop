import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl, Connection } from "@solana/web3.js";
import { useMemo, ReactNode } from "react";

import "@solana/wallet-adapter-react-ui/styles.css";

interface Props {
  children: ReactNode;
}

export function SolanaProvider({ children }: Props) {
  // Use localnet for development
  const endpoint = useMemo(() => {
    // Check if we're in development
    const isLocal = window.location.hostname === "localhost";
    return isLocal ? "http://localhost:8899" : clusterApiUrl(WalletAdapterNetwork.Devnet);
  }, []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

// Export connection hook for easy access
export function useConnection() {
  const endpoint = window.location.hostname === "localhost"
    ? "http://localhost:8899"
    : clusterApiUrl(WalletAdapterNetwork.Devnet);
  return new Connection(endpoint, "confirmed");
}
