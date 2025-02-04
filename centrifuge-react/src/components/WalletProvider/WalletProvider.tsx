import { addressToHex, ComputedMultisig, evmToSubstrateAddress, Multisig } from '@centrifuge/centrifuge-js'
import { isWeb3Injected } from '@polkadot/extension-dapp'
import { getWallets } from '@subwallet/wallet-connect/dotsama/wallets'
import { Wallet } from '@subwallet/wallet-connect/types'
import { Web3ReactState } from '@web3-react/types'
import { WalletConnect as WalletConnectV2 } from '@web3-react/walletconnect-v2'
import { AbstractProvider, getDefaultProvider, JsonRpcProvider } from 'ethers'
import * as React from 'react'
import { useQuery } from 'react-query'
import { firstValueFrom, map, switchMap } from 'rxjs'
import { ReplacedError, useAsyncCallback } from '../../hooks/useAsyncCallback'
import { useCentrifugeQuery } from '../../hooks/useCentrifugeQuery'
import { useCentrifuge, useCentrifugeApi, useCentrifugeConsts } from '../CentrifugeProvider'
import { EvmChains, getAddChainParameters, getEvmUrls } from './evm/chains'
import { EvmConnectorMeta, getEvmConnectors } from './evm/connectors'
import { getStore } from './evm/utils'
import { CombinedSubstrateAccount, Network, Proxy, State, SubstrateAccount } from './types'
import { useConnectEagerly } from './useConnectEagerly'
import { Action, getPersisted, persist, useWalletStateInternal } from './useWalletState'
import { useGetNetworkName } from './utils'
import { WalletDialog } from './WalletDialog'

export type WalletContextType = {
  isEvmOnSubstrate: boolean
  connectedType: 'evm' | 'substrate' | null
  connectedNetwork: State['walletDialog']['network']
  connectedNetworkName: string | null
  scopedNetworks: Network[] | null
  setScopedNetworks: (scopedNetwork: Network[] | null) => void
  dispatch: (action: Action) => void
  showNetworks: (network?: State['walletDialog']['network']) => void
  showWallets: (network?: State['walletDialog']['network'], wallet?: State['walletDialog']['wallet']) => void
  showAccounts: () => void
  walletDialog: State['walletDialog']
  connect: (wallet: Wallet | EvmConnectorMeta, network?: Network) => Promise<SubstrateAccount[] | string[] | undefined>
  disconnect: () => void
  pendingConnect: {
    isConnecting: boolean
    isError: boolean
    wallet: Wallet | EvmConnectorMeta | null
  }
  substrate: {
    evmChainId?: number
    accounts: SubstrateAccount[] | null
    proxies: Record<string, Proxy[]> | undefined
    proxiesAreLoading: boolean
    multisigs: ComputedMultisig[]
    combinedAccounts: CombinedSubstrateAccount[] | null
    selectedAccount: SubstrateAccount | null
    selectedAddress: string | null
    selectedWallet: Wallet | null
    selectedProxies: Proxy[] | null
    selectedMultisig: ComputedMultisig | null
    selectedCombinedAccount: CombinedSubstrateAccount | null
    selectAccount: (address: string, proxies?: string[] | null, multisig?: string | null) => void
    addMultisig: (multisig: Multisig) => void
    subscanUrl?: string
    isWeb3Injected: boolean
  }
  evm: Pick<Web3ReactState, 'chainId' | 'accounts'> & {
    connectors: EvmConnectorMeta[]
    chains: EvmChains
    selectedWallet: EvmConnectorMeta | null
    isSmartContractWallet: boolean
    selectedAddress: string | null
    getProvider(chainId: number): JsonRpcProvider | AbstractProvider
  }
}

const unsupportedNetworksByDefaultProvider = [
  'base-sepolia',
  'base-mainnet',
  'celo-alfajores',
  'celo-mainnet',
  'arbitrum-sepolia',
  'arbitrum-mainnet',
]

const WalletContext = React.createContext<WalletContextType>(null as any)

export const wallets = getWallets()

export function useWallet() {
  const ctx = React.useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within Provider')
  return ctx
}

export function useAddress(type?: 'substrate' | 'evm') {
  const { connectedType, evm, substrate, isEvmOnSubstrate } = useWallet()
  if (type === 'evm' || (!type && connectedType === 'evm' && !isEvmOnSubstrate)) {
    return evm.accounts?.[0] ?? undefined
  }
  if (isEvmOnSubstrate) {
    return (
      substrate.selectedCombinedAccount?.actingAddress ||
      (evm.accounts?.[0] ? evmToSubstrateAddress(evm.accounts?.[0], substrate.evmChainId!) : undefined)
    )
  }
  if (type === 'substrate' && connectedType === 'evm') {
    return evm.accounts?.[0] ? evmToSubstrateAddress(evm.accounts?.[0], evm.chainId!) : undefined
  }
  return substrate.selectedCombinedAccount?.actingAddress || substrate.selectedAccount?.address
}

export function useCentEvmChainId() {
  const cent = useCentrifuge()
  const api = useCentrifugeApi()
  const { data: centEvmChainId } = useQuery(
    ['evmChainId'],
    () => {
      try {
        return firstValueFrom(
          cent.getApi().pipe(
            switchMap((api) => api.query.evmChainId.chainId()),
            map((chainIdData) => chainIdData.toPrimitive() as number)
          )
        )
      } catch {
        return undefined
      }
    },
    {
      staleTime: Infinity,
      suspense: true,
      enabled: !!api.query.evmChainId,
    }
  )
  return centEvmChainId
}

type WalletProviderProps = {
  children: React.ReactNode
  evmChains?: EvmChains
  evmAdditionalConnectors?: EvmConnectorMeta[]
  walletConnectId?: string
  subscanUrl?: string
  showAdvancedAccounts?: boolean
  showTestNets?: boolean
  showFinoa?: boolean
  infuraApiKey?: string
  alchemyApiKey?: string
  tenderlyApiKey?: string
}

let cachedEvmConnectors: EvmConnectorMeta[] | undefined = undefined
const cachedProviders = new Map<number, JsonRpcProvider | AbstractProvider>()

export function WalletProvider({
  children,
  evmChains: evmChainsProp = {
    1: {
      urls: ['https://cloudflare-eth.com'],
      isTestnet: false,
    },
  },
  evmAdditionalConnectors,
  walletConnectId,
  subscanUrl,
  showAdvancedAccounts,
  showTestNets,
  showFinoa,
  infuraApiKey,
  alchemyApiKey,
  tenderlyApiKey,
}: WalletProviderProps) {
  if (!evmChainsProp[1]?.urls[0]) throw new Error('Mainnet should be defined in EVM Chains')

  const cent = useCentrifuge()
  const consts = useCentrifugeConsts()
  const centEvmChainId = useCentEvmChainId()

  const evmChains = React.useMemo(() => {
    const centUrl = new URL(cent.config.centrifugeWsUrl.split(',')[0])
    centUrl.protocol = 'https:'
    const chains = {
      ...evmChainsProp,
    }
    if (centEvmChainId) {
      ;(chains as any)[centEvmChainId] = {
        urls: [centUrl.toString()],
        iconUrl: '',
        name: 'Centrifuge',
        nativeCurrency: {
          name: consts.chainSymbol,
          symbol: consts.chainSymbol,
          decimals: consts.chainDecimals,
        },
        blockExplorerUrl: 'https://centrifuge.subscan.io/',
      }
    }
    return chains
  }, [centEvmChainId])

  const evmConnectors =
    cachedEvmConnectors ||
    (cachedEvmConnectors = getEvmConnectors(getEvmUrls(evmChains), {
      additionalConnectors: evmAdditionalConnectors,
      walletConnectId,
      substrateEvmChainId: centEvmChainId,
    }))

  const [state, dispatch] = useWalletStateInternal(evmConnectors)
  const isEvmOnSubstrate = state.connectedType === 'evm' && state.evm.chainId === centEvmChainId

  const unsubscribeRef = React.useRef<(() => void) | null>()

  React.useEffect(
    () => () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    },
    []
  )
  const evmSubstrateAccounts = isEvmOnSubstrate
    ? state.evm.accounts?.map((addr) => ({
        address: evmToSubstrateAddress(addr, centEvmChainId!),
        source: state.evm.selectedWallet!.id,
        wallet: state.evm.selectedWallet as any,
      }))
    : null

  // const { data: proxies, isLoading: proxiesAreLoading } = useQuery(
  //   [
  //     'proxies',
  //     state.substrate.accounts?.map((acc) => acc.address),
  //     state.substrate.multisigs.map((m) => m.address),
  //     evmSubstrateAccounts?.map((acc) => acc.address),
  //   ],
  //   () =>
  //     firstValueFrom(
  //       cent.proxies.getMultiUserProxies([
  //         (state.substrate.accounts || [])
  //           .map((acc) => acc.address)
  //           .concat(state.substrate.multisigs.map((m) => m.address))
  //           .concat(evmSubstrateAccounts?.map((acc) => acc.address) || []),
  //       ])
  //     ),
  //   {
  //     staleTime: Infinity,
  //   }
  // )

  // const delegatees = [...new Set(Object.values(proxies ?? {})?.flatMap((p) => p.map((d) => d.delegator)))]
  // const { data: nestedProxies, isLoading: nestedProxiesAreLoading } = useQuery(
  //   ['nestedProxies', delegatees],
  //   () => firstValueFrom(cent.proxies.getMultiUserProxies([delegatees])),
  //   {
  //     enabled: !!Object.keys(proxies ?? {})?.length,
  //     staleTime: Infinity,
  //   }
  // )

  const [proxies] = useCentrifugeQuery(['allProxies'], (cent) => cent.proxies.getAllProxies())

  function getProvider(chainId: number) {
    const defaultUrl = (evmChains as any)[chainId].urls[0]
    const network = (evmChains as any)[chainId].network
    if (!cachedProviders.has(chainId)) {
      let networkish = unsupportedNetworksByDefaultProvider.includes(network) ? defaultUrl : network
      const provider = getDefaultProvider(networkish, {
        infura: infuraApiKey,
        alchemy: alchemyApiKey,
        tenderly: tenderlyApiKey,
        exclusive: ['infura', 'alchemy', 'tenderly'],
      })
      cachedProviders.set(chainId, provider)
      return provider
    }
    return cachedProviders.get(chainId) as JsonRpcProvider | AbstractProvider
  }

  function setFilteredAccounts(accounts: SubstrateAccount[]) {
    const mappedAccounts = accounts
      .map((acc) => ({
        ...acc,
        address: addressToHex(acc.address),
      }))
      .filter((acc) => (acc as any).type !== 'ethereum')

    const { address: persistedAddress } = getPersisted()
    const matchingAccount = persistedAddress && mappedAccounts.find((acc) => acc.address === persistedAddress)?.address
    const address = matchingAccount || mappedAccounts[0]?.address
    dispatch({
      type: 'substrateSetState',
      payload: {
        accounts: mappedAccounts,
        selectedAccountAddress: address,
        multisigAddress: null,
        proxyAddresses: null,
      },
    })
  }

  const {
    execute: setPendingConnect,
    args: connectingArgs,
    isLoading: isConnectingByInteraction,
    isError: isConnectError,
  } = useAsyncCallback(
    (_: EvmConnectorMeta | Wallet, cb: () => Promise<SubstrateAccount[] | string[] | undefined>) => cb(),
    {
      throwOnReplace: true,
    }
  )

  const connectSubstrate = React.useCallback(async (wallet: Wallet) => {
    unsubscribeRef.current?.()

    if (!wallet?.installed) throw new Error('Wallet not available')

    const accounts = await setPendingConnect(wallet, async () => {
      try {
        const allAccounts = await wallet.getAccounts()
        if (!allAccounts) throw new Error('Failed to get accounts')

        setFilteredAccounts(allAccounts)
        dispatch({ type: 'substrateSetState', payload: { selectedWallet: wallet } })
        dispatch({ type: 'setConnectedType', payload: 'substrate' })

        unsubscribeRef.current = await wallet.subscribeAccounts(setFilteredAccounts)

        return allAccounts
      } catch (error) {
        if (error instanceof ReplacedError) return
        console.error(error)
        throw error
      }
    })
    return accounts
  }, [])

  const connectEvm = React.useCallback(
    async (wallet: EvmConnectorMeta, network?: Network) => {
      const chainId = network === 'centrifuge' ? centEvmChainId : network
      const { connector } = wallet
      try {
        const accounts = await setPendingConnect(wallet, async () => {
          await (connector instanceof WalletConnectV2
            ? connector.activate(chainId)
            : connector.activate(chainId ? getAddChainParameters(evmChains, chainId) : undefined))
          return getStore(wallet.connector).getState().accounts
        })

        dispatch({ type: 'evmSetState', payload: { selectedWallet: wallet } })
        dispatch({ type: 'setConnectedType', payload: 'evm' })

        return accounts
      } catch (error) {
        if (error instanceof ReplacedError) return
        console.error(error)
        throw error
      }
    },
    [evmChains]
  )

  const connect = React.useCallback(
    async (wallet: Wallet | EvmConnectorMeta, network?: Network) => {
      if ('connector' in wallet) {
        return connectEvm(wallet, network)
      }
      return connectSubstrate(wallet)
    },
    [connectEvm, connectSubstrate]
  )

  const disconnect = React.useCallback(async () => {
    evmConnectors.forEach((connectorMeta) => {
      if (connectorMeta.connector?.deactivate) {
        connectorMeta.connector.deactivate()
      } else {
        connectorMeta.connector.resetState()
      }
    })

    persist(null)
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }

    dispatch({ type: 'reset' })
  }, [])

  const isTryingToConnectEagerly = useConnectEagerly((wallet) => connect(wallet), dispatch, evmConnectors)
  const isConnecting = isConnectingByInteraction || isTryingToConnectEagerly
  const getNetworkName = useGetNetworkName(evmChains, centEvmChainId ?? null)

  const [scopedNetworks, setScopedNetworks] = React.useState<WalletContextType['scopedNetworks']>(null)

  const { data: isSmartContractWallet } = useQuery(
    ['isSmartContractWallet', state.evm.accounts?.[0], state.evm.chainId],
    async () => {
      const provider = getProvider(state.evm.chainId!)
      const bytecode = await provider.getCode(state.evm.accounts![0])
      return !!(bytecode && bytecode.replaceAll('0', '') !== 'x')
    },
    { enabled: !!state.evm.accounts?.[0] && !!state.evm.chainId, staleTime: Infinity }
  )

  const ctx: WalletContextType = React.useMemo(() => {
    const combinedProxies = {
      ...proxies,
    }
    const combinedSubstrateAccounts =
      (evmSubstrateAccounts || state.substrate.accounts)?.flatMap((account) => {
        const { address } = account
        const multisigs = state.substrate.multisigs.filter((multi) =>
          multi.signers.find((signer) => signer === address)
        )
        const accounts: CombinedSubstrateAccount[] = [{ signingAccount: account, actingAddress: account.address }]

        const directProxies: Proxy[][] = []
        findProxySequences(combinedProxies, directProxies, [], address)
        accounts.push(
          ...directProxies.map((p) => ({ signingAccount: account, proxies: p, actingAddress: p.at(-1)!.delegator }))
        )

        multisigs.forEach((multi) => {
          accounts.push({ signingAccount: account, multisig: multi, actingAddress: multi.address })
          const multisigProxies: Proxy[][] = []
          findProxySequences(combinedProxies, multisigProxies, [], multi.address)
          accounts.push(
            ...multisigProxies.map((p) => ({
              signingAccount: account,
              proxies: p,
              multisig: multi,
              actingAddress: p.at(-1)!.delegator,
            }))
          )
        })

        return accounts
      }) ?? null
    const selectedCombinedAccount = combinedSubstrateAccounts?.find(
      (acc) =>
        state.substrate.selectedAccountAddress === acc.signingAccount.address &&
        state.substrate.multisigAddress === acc.multisig?.address &&
        ((!acc.proxies && !state.substrate.proxyAddresses) ||
          (acc.proxies?.length === state.substrate.proxyAddresses?.length &&
            acc.proxies!.every((p, i) => p.delegator === state.substrate.proxyAddresses?.[i])))
    )
    null

    const selectedSubstrateAccount =
      state.substrate.accounts?.find((acc) => acc.address === state.substrate.selectedAccountAddress) ?? null
    const connectedNetwork =
      state.connectedType === 'evm' ? state.evm.chainId! : state.connectedType === 'substrate' ? 'centrifuge' : null
    return {
      connectedType: state.connectedType,
      isEvmOnSubstrate,
      connectedNetwork,
      connectedNetworkName: connectedNetwork ? getNetworkName(connectedNetwork) : null,
      scopedNetworks,
      setScopedNetworks,
      dispatch,
      showNetworks: (network?: State['walletDialog']['network']) =>
        dispatch({ type: 'showWalletDialog', payload: { view: 'networks', network, wallet: null } }),
      showWallets: (network?: State['walletDialog']['network'], wallet?: State['walletDialog']['wallet']) =>
        dispatch({ type: 'showWalletDialog', payload: { view: 'wallets', network, wallet } }),
      showAccounts: () => dispatch({ type: 'showWalletDialogAccounts', payload: { network: state.evm.chainId } }),
      walletDialog: state.walletDialog,
      pendingConnect: {
        isConnecting,
        isError: isConnectError,
        wallet: connectingArgs?.[0] || null,
      },
      connect,
      disconnect,
      substrate: {
        ...state.substrate,
        evmChainId: centEvmChainId,
        accounts: evmSubstrateAccounts || state.substrate.accounts,
        combinedAccounts: combinedSubstrateAccounts,
        selectedAccount: selectedSubstrateAccount,
        selectedAddress: selectedSubstrateAccount?.address || null,
        selectedCombinedAccount:
          ((state.substrate.multisigAddress || state.substrate.proxyAddresses) && selectedCombinedAccount) || null,
        isWeb3Injected,
        selectAccount: (address: string, proxies?: string[] | null, multisig?: string | null) => {
          dispatch({
            type: 'substrateSetState',
            payload: {
              selectedAccountAddress: address,
              proxyAddresses: proxies ?? null,
              multisigAddress: multisig ?? null,
            },
          })
        },
        addMultisig: (multisig) => {
          dispatch({
            type: 'substrateAddMultisig',
            payload: multisig,
          })
        },
        selectedProxies: selectedCombinedAccount?.proxies || null,
        selectedMultisig: selectedCombinedAccount?.multisig || null,
        proxies: combinedProxies,
        proxiesAreLoading: !proxies,
        subscanUrl,
      },
      evm: {
        ...state.evm,
        accounts: state.evm.accounts && [state.evm.accounts?.[0]],
        selectedAddress: state.evm.accounts?.[0] || null,
        connectors: evmConnectors,
        chains: evmChains,
        isSmartContractWallet: isSmartContractWallet ?? false,
        getProvider,
      },
    }
  }, [connect, disconnect, proxies, state, isConnectError, isConnecting, isSmartContractWallet])

  return (
    <WalletContext.Provider value={ctx}>
      {children}
      <WalletDialog
        evmChains={evmChains}
        showAdvancedAccounts={showAdvancedAccounts}
        showTestNets={showTestNets}
        showFinoa={showFinoa}
      />
    </WalletContext.Provider>
  )
}

function findProxySequences(
  proxies: Record<string, Proxy[]>,
  acc: Proxy[][],
  curSeq: Proxy[],
  delegatee: string,
  depth = 0
) {
  if (!proxies[delegatee] || depth >= 3) return
  proxies[delegatee].forEach((nextProxy) => {
    const seq = [...curSeq, nextProxy]
    acc.push(seq)
    findProxySequences(proxies, acc, seq, nextProxy.delegator, depth + 1)
  })
}
