import BN from 'bn.js'
import { Loan, NFT, interestRateToFee, ITinlake, PendingTransaction } from '@centrifuge/tinlake-js'
import { ITinlake as ITinlakeV3 } from '@centrifuge/tinlake-js-v3'
import { maxUint256 } from '../../utils/maxUint256'
import { PoolData } from '../../ducks/pool'

export type TrancheType = 'junior' | 'senior'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export interface TinlakeResult {
  data?: any
  errorMsg?: string
  tokenId?: string
  loanId?: string
}

// TinlakeAction args need to be serializable, as they are stored in Redux state for the async transactions duck
// Based on: https://github.com/microsoft/TypeScript/issues/1897#issuecomment-657294463
type SerializableScalar = string & number & boolean
type SerializableObject = { [key: string]: SerializableScalar & SerializableObject & SerializableArray }
type SerializableArray = (SerializableScalar & SerializableObject & SerializableArray)[]
type Serializable = SerializableScalar & SerializableObject & SerializableArray

export type TinlakeAction = (tinlake: ITinlake, ...args: Serializable[]) => Promise<PendingTransaction>
export type TinlakeV3Action = (tinlake: ITinlakeV3, ...args: Serializable[]) => Promise<PendingTransaction>

export async function getNFT(registry: string, tinlake: ITinlake, tokenId: string) {
  let nftOwner: string
  let nftData: any

  try {
    nftOwner = (await tinlake.getOwnerOfCollateral(registry, tokenId)).toString()
  } catch (e) {
    return loggedError(e, 'Could not get NFT owner for NFT ID', tokenId)
  }

  if (!nftOwner) {
    return loggedError({}, 'Could not get NFT owner for NFT ID', tokenId)
  }

  try {
    nftData = await tinlake.getNFTData(registry, tokenId)
  } catch (e) {
    nftData = null
  }
  const replacedTokenId = tokenId.replace(/^0x/, '')
  const bnTokenId = new BN(replacedTokenId)

  const nft: NFT = {
    nftOwner,
    nftData,
    registry,
    tokenId: bnTokenId,
  }

  return {
    nft,
    tokenId,
  }
}

async function getOrCreateProxy(tinlake: ITinlake, address: string) {
  let proxyAddress
  // check if user already has a proxy address
  try {
    proxyAddress = await tinlake.checkProxyExists(address)
  } catch (e) {
    proxyAddress = null
  }

  // create new proxy address in case user did not have one
  if (!proxyAddress) {
    try {
      proxyAddress = await tinlake.proxyCreateNew(address)
    } catch (e) {
      throw e
    }
  }
  return proxyAddress
}

export const mintNFT = async (
  tinlake: ITinlake,
  nftAddr: string,
  owner: string,
  tokenId: string,
  ref: string,
  amount: string,
  asset: string
): Promise<PendingTransaction> => {
  try {
    return await tinlake.mintNFT(nftAddr, owner, tokenId, ref, amount, asset)
  } catch (e) {
    return loggedError(e, 'Could not mint NFT.', tokenId)
  }
}

export const issue = async (
  tinlake: ITinlake,
  tokenId: string,
  nftRegistryAddress: string
): Promise<PendingTransaction> => {
  if (!tinlake.signer) {
    throw new Error('Missing tinlake signer')
  }

  const user = await tinlake.signer.getAddress()!
  let tokenOwner

  try {
    tokenOwner = await tinlake.getNFTOwner(nftRegistryAddress, tokenId)
  } catch (e) {
    return loggedError(e, 'Could not retrieve nft owner.', tokenId)
  }

  // case: borrower is owner of nft
  if (user.toLowerCase() === tokenOwner.toString().toLowerCase()) {
    // get or create new proxy
    let proxyAddress
    try {
      proxyAddress = await getOrCreateProxy(tinlake, user)
    } catch (e) {
      return loggedError(e, 'Could not retrieve proxyAddress.', user)
    }

    // approve proxy to take nft if not yet happened
    if (!(await tinlake.isNFTApprovedForAll(nftRegistryAddress, user, proxyAddress))) {
      try {
        const approveTx = await tinlake.setNFTApprovalForAll(nftRegistryAddress, proxyAddress, true)
        await tinlake.getTransactionReceipt(approveTx)
      } catch (e) {
        return loggedError(e, 'Could not approve proxy to take NFT.', tokenId)
      }
    }

    // transfer issue
    try {
      return await tinlake.proxyTransferIssue(proxyAddress, nftRegistryAddress, tokenId)
    } catch (e) {
      return loggedError(e, 'Could not Issue loan.', tokenId)
    }
  }

  let proxyOwner
  try {
    proxyOwner = (await tinlake.getProxyOwnerByAddress(tokenOwner.toString())).toString()
  } catch (e) {
    proxyOwner = ZERO_ADDRESS
  }

  // case: borrower's proxy is owner of nft
  if (user.toLowerCase() === proxyOwner.toLowerCase()) {
    try {
      return await tinlake.proxyIssue(tokenOwner.toString(), nftRegistryAddress, tokenId)
    } catch (e) {
      return loggedError(e, 'Could not Issue loan.', tokenId)
    }
  }

  // case: nft can not be used to open a loan -> borrower/borrower's proxy not nft owner

  return loggedError({}, 'Borrower is not nft owner.', tokenId)
}

export async function getProxyOwner(tinlake: ITinlake, loanId: string): Promise<TinlakeResult> {
  let owner = ZERO_ADDRESS
  try {
    owner = (await tinlake.getProxyOwnerByLoan(loanId)).toString()
  } catch (e) {}
  return { data: owner }
}

export async function getLoan(tinlake: ITinlake, loanId: string): Promise<Loan | null> {
  let loan
  const count = await tinlake.loanCount()

  if (count.toNumber() <= Number(loanId) || Number(loanId) === 0) {
    return null
  }

  loan = await tinlake.getLoan(loanId)
  if (!loan) return null

  const nftData = await getNFT(loan.registry, tinlake, `${loan.tokenId}`)
  loan.nft = (nftData && (nftData as any).nft) || {}
  await addProxyDetails(tinlake, loan)

  return loan
}

async function addProxyDetails(tinlake: ITinlake, loan: Loan) {
  try {
    loan.proxyOwner = (await tinlake.getProxyOwnerByLoan(loan.loanId)).toString()
  } catch (e) {}
}

export async function getLoans(tinlake: ITinlake): Promise<TinlakeResult | PendingTransaction> {
  let loans
  try {
    loans = await tinlake.getLoanList()
  } catch (e) {
    return loggedError(e, 'Could not get loans', '')
  }

  const loansList = []
  for (let i = 0; i < loans.length; i += 1) {
    const loan = loans[i]
    await addProxyDetails(tinlake, loan)
    loansList.push(loan)
  }
  return {
    data: loansList,
  }
}

export async function setInterest(
  tinlake: ITinlake,
  loanId: string,
  debt: string,
  rate: string
): Promise<PendingTransaction> {
  const rateGroup = interestRateToFee(rate)
  const existsRateGroup = await tinlake.existsRateGroup(rateGroup)

  // init rate group
  if (!existsRateGroup) {
    try {
      const initRateTx = await tinlake.initRate(rateGroup)
      await tinlake.getTransactionReceipt(initRateTx)
    } catch (e) {
      return loggedError(e, 'Could not init rate group', loanId)
    }
  }
  // set rate group
  try {
    if (debt.toString() === '0') {
      return await tinlake.setRate(loanId, rateGroup)
    }
    return await tinlake.changeRate(loanId, rateGroup)
  } catch (e) {
    return loggedError(e, 'Could not set rate group', loanId)
  }
}

export async function submitSeniorSupplyOrder(tinlake: ITinlakeV3, amount: string): Promise<PendingTransaction> {
  if (!tinlake.signer) {
    throw new Error('Missing tinlake signer')
  }

  try {
    const approvalTx = await tinlake.approveSeniorForCurrency(maxUint256)
    await tinlake.getTransactionReceipt(approvalTx!)
  } catch (e) {
    return loggedError(e, `Could not approve currency for senior`, '')
  }

  return tinlake.submitSeniorSupplyOrder(amount)
}

export async function submitJuniorSupplyOrder(tinlake: ITinlakeV3, amount: string): Promise<PendingTransaction> {
  if (!tinlake.signer) {
    throw new Error('Missing tinlake signer')
  }

  try {
    const approvalTx = await tinlake.approveJuniorForCurrency(maxUint256)
    await tinlake.getTransactionReceipt(approvalTx!)
  } catch (e) {
    return loggedError(e, `Could not approve currency for junior`, '')
  }

  return tinlake.submitJuniorSupplyOrder(amount)
}

export async function disburseSenior(tinlake: ITinlakeV3): Promise<PendingTransaction> {
  return tinlake.disburseSenior()
}

export async function disburseJunior(tinlake: ITinlakeV3): Promise<PendingTransaction> {
  return tinlake.disburseJunior()
}

export async function solveEpoch(tinlake: ITinlakeV3): Promise<PendingTransaction> {
  return tinlake.solveEpoch()
}

export async function executeEpoch(tinlake: ITinlakeV3): Promise<PendingTransaction> {
  return tinlake.executeEpoch()
}

export async function getPool(tinlake: ITinlake | ITinlakeV3): Promise<PoolData | null> {
  const version = 'version' in tinlake ? tinlake.version : 2

  // V3 TODO
  const juniorReserve = version === 2 ? await tinlake.getJuniorReserve() : new BN(0)
  const juniorTokenPrice = await tinlake.getTokenPriceJunior()
  const seniorReserve = version === 2 ? await tinlake.getSeniorReserve() : new BN(0)
  const seniorTokenPrice =
    version === 2 && tinlake.signer
      ? await tinlake.getTokenPriceSenior(await tinlake.signer.getAddress())
      : await (tinlake as ITinlakeV3).getTokenPriceSenior()
  const seniorInterestRate = version === 2 ? await tinlake.getSeniorInterestRate() : new BN(0)
  const seniorTokenSupply = version === 2 ? await tinlake.getSeniorTotalSupply() : new BN(0)
  const minJuniorRatio = await tinlake.getMinJuniorRatio()
  const maxJuniorRatio = version === 3 ? await (tinlake as ITinlakeV3).getMaxJuniorRatio() : new BN(0)
  const maxReserve = version === 3 ? await (tinlake as ITinlakeV3).getMaxReserve() : new BN(0)
  const juniorAssetValue = version === 2 ? await tinlake.getAssetValueJunior() : new BN(0)
  const juniorTokenSupply = version === 2 ? await tinlake.getJuniorTotalSupply() : new BN(0)
  // temp fix: until solved on contract level
  const currentJuniorRatio =
    version === 2
      ? juniorAssetValue.toString() === '0'
        ? new BN(0)
        : await tinlake.getCurrentJuniorRatio()
      : await tinlake.getCurrentJuniorRatio()

  try {
    return {
      minJuniorRatio,
      maxJuniorRatio,
      currentJuniorRatio,
      maxReserve,
      junior: {
        type: 'junior',
        availableFunds: juniorReserve,
        tokenPrice: juniorTokenPrice,
        totalSupply: juniorTokenSupply,
        token: 'TIN',
      },
      senior: {
        type: 'senior',
        availableFunds: seniorReserve,
        tokenPrice: seniorTokenPrice,
        totalSupply: seniorTokenSupply,
        token: 'DROP',
        interestRate: seniorInterestRate,
      },
      availableFunds: juniorReserve.add(seniorReserve),
    }
  } catch (e) {
    return null
  }
}

export async function borrow(tinlake: ITinlake, loan: Loan, amount: string): Promise<PendingTransaction> {
  if (!tinlake.signer) {
    throw new Error('Missing tinlake signer')
  }

  const { loanId } = loan
  const address = await tinlake.signer.getAddress()
  const proxy = loan.ownerOf

  // make sure tranche has enough funds
  const juniorReserve = await tinlake.getJuniorReserve()
  const seniorReserve = await tinlake.getSeniorReserve()
  const trancheReserve = juniorReserve.add(seniorReserve)
  if (new BN(amount).cmp(trancheReserve) > 0) {
    return loggedError({}, 'There is not enough available funds.', loanId)
  }

  // borrow with proxy
  try {
    return await tinlake.proxyLockBorrowWithdraw(proxy.toString(), loanId, amount, address!)
  } catch (e) {
    return loggedError(e, 'Could not finance asset.', loanId)
  }
}

// repay full loan debt
export async function repay(tinlake: ITinlake, loan: Loan): Promise<PendingTransaction> {
  if (!tinlake.signer) {
    throw new Error('Missing tinlake signer')
  }

  const { loanId } = loan
  const proxy = loan.ownerOf
  const address = await tinlake.signer.getAddress()

  // use entire user balance as repay amount to make sure that enough funds are provided to cover the entire debt
  const balance = await tinlake.getCurrencyBalance(address!)
  const allowance = await tinlake.getCurrencyAllowance(address!, proxy.toString())

  // only approve if allowance is smaller than than the current balance
  if (allowance.lt(balance)) {
    try {
      const approveTx = await tinlake.approveCurrency(proxy.toString(), maxUint256)
      await tinlake.getTransactionReceipt(approveTx)
    } catch (e) {
      return loggedError(e, 'Could not approve proxy.', loanId)
    }
  }

  // repay
  try {
    return await tinlake.proxyRepayUnlockClose(proxy.toString(), loan.tokenId.toString(), loanId, loan.registry)
  } catch (e) {
    return loggedError(e, 'Could not repay.', loanId)
  }
}

export async function getInvestor(tinlake: ITinlake, address: string) {
  return await tinlake.getInvestor(address)
}

export async function setAllowance(
  tinlake: ITinlake,
  address: string,
  maxSupplyAmount: string,
  maxRedeemAmount: string,
  trancheType: TrancheType
): Promise<PendingTransaction> {
  try {
    if (trancheType === 'junior') {
      return await tinlake.approveAllowanceJunior(address, maxSupplyAmount, maxRedeemAmount)
    }
    return await tinlake.approveAllowanceSenior(address, maxSupplyAmount, maxRedeemAmount)
  } catch (e) {
    return loggedError(e, `Could not set allowance for ${trancheType}`, address)
  }
}

export async function setMinJuniorRatio(tinlake: ITinlake | ITinlakeV3, ratio: string): Promise<PendingTransaction> {
  return await tinlake.setMinimumJuniorRatio(ratio)
}

export async function supply(
  tinlake: ITinlake,
  supplyAmount: string,
  trancheType: TrancheType
): Promise<PendingTransaction> {
  if (!tinlake.signer) {
    throw new Error('Missing tinlake signer')
  }

  const address = await tinlake.signer.getAddress()

  console.log('supply address', address)

  let allowance = new BN(0)
  if (trancheType === 'junior') {
    allowance = (await tinlake.getJuniorForCurrencyAllowance(address!)) || new BN(0)
    console.log('junior allowance', allowance.toString())
  } else if (trancheType === 'senior') {
    allowance = (await tinlake.getSeniorForCurrencyAllowance(address!)) || new BN(0)
    console.log('senior allowance', allowance.toString())
  }

  console.log('checking if approval is needed')

  // only approve if allowance is smaller than than supplyAmount
  if (allowance.lt(new BN(supplyAmount))) {
    console.log('requires approval', supplyAmount.toString())
    // approve currency
    try {
      if (trancheType === 'junior') {
        const approvalTx = await tinlake.approveJuniorForCurrency(maxUint256)
        const approvalResult = await tinlake.getTransactionReceipt(approvalTx!)
        console.log('approval junior', approvalResult)
      } else if (trancheType === 'senior') {
        const approvalTx = await tinlake.approveSeniorForCurrency(maxUint256)
        const approvalResult = await tinlake.getTransactionReceipt(approvalTx!)
        console.log('approval senior', approvalResult)
      }
    } catch (e) {
      return loggedError(e, `Could not approve currency for ${trancheType}.`, '')
    }
  }

  console.log('actually supplying')

  // supply
  try {
    if (trancheType === 'junior') {
      const res = await tinlake.supplyJunior(supplyAmount)
      console.log('supplying junior', res)
      return res
    }
    const res = await tinlake.supplySenior(supplyAmount)
    console.log('supplying senior', res)
    return res
  } catch (e) {
    return loggedError(e, `Could not supply ${trancheType}`, '')
  }
}

export async function redeem(
  tinlake: ITinlake,
  redeemAmount: string,
  trancheType: TrancheType
): Promise<PendingTransaction> {
  if (!tinlake.signer) {
    throw new Error('Missing tinlake signer')
  }

  const address = await tinlake.signer.getAddress()

  let allowance = new BN(0)
  if (trancheType === 'junior') {
    allowance = (await tinlake.getJuniorTokenAllowance(address!)) || new BN(0)
  } else if (trancheType === 'senior') {
    allowance = (await tinlake.getSeniorTokenAllowance(address!)) || new BN(0)
  }

  // only approve if allowance is smaller than than redeemAmount
  if (allowance.lt(new BN(redeemAmount))) {
    // approve junior token
    try {
      if (trancheType === 'junior') {
        const approveTx = await tinlake.approveJuniorToken(maxUint256)
        await tinlake.getTransactionReceipt(approveTx)
      } else if (trancheType === 'senior') {
        const approveTx = await tinlake.approveSeniorToken(maxUint256)
        await tinlake.getTransactionReceipt(approveTx)
      }
    } catch (e) {
      return loggedError(e, `Could not approve ${trancheType} Token.`, '')
    }
  }

  // repay
  try {
    if (trancheType === 'junior') {
      return await tinlake.redeemJunior(redeemAmount)
    }
    if (trancheType === 'senior') {
      return await tinlake.redeemSenior(redeemAmount)
    }
  } catch (e) {
    return loggedError(e, `Could not redeem ${trancheType}.`, '')
  }

  return { status: 0 } as any
}

function loggedError(error: any, message: string, id: string): PendingTransaction {
  console.error(`${message} ${id}`, error)
  return {
    status: 0,
    error: message,
  } as any
}
