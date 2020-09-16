import { Constructor, TinlakeParams, PendingTransaction } from '../Tinlake'
import BN from 'bn.js'

export function LenderActions<ActionBase extends Constructor<TinlakeParams>>(Base: ActionBase) {
  return class extends Base implements ILenderActions {
    // senior tranche functions
    submitSeniorSupplyOrder = async (supplyAmount: string) => {
      return this.pending(this.contract('SENIOR_OPERATOR').supplyOrder(supplyAmount, this.overrides))
    }

    submitSeniorRedeemOrder = async (redeemAmount: string) => {
      return this.pending(this.contract('SENIOR_OPERATOR').redeemOrder(redeemAmount, this.overrides))
    }

    disburseSenior = async () => {
      console.log(this.contract('SENIOR_OPERATOR').functions)
      return this.pending(this.contract('SENIOR_OPERATOR')['disburse()'](this.overrides))
    }

    getSeniorTokenAllowance = async (owner: string) => {
      return (
        await this.contract('SENIOR_TOKEN').allowance(owner, this.contractAddresses['SENIOR'], this.overrides)
      ).toBN()
    }

    checkSeniorTokenMemberlist = async (user: string) => {
      return await this.contract('SENIOR_TOKEN').hasMember(user)
    }

    approveSeniorToken = async (tokenAmount: string) => {
      return this.pending(
        this.contract('SENIOR_TOKEN').approve(this.contractAddresses['SENIOR'], tokenAmount, this.overrides)
      )
    }

    calcSeniorDisburse = async (user: string) => {
      return await this.contract('SENIOR_TRANCHE')['calcDisburse(address)'](user)
    }

    // junior tranche functions
    submitJuniorSupplyOrder = async (supplyAmount: string) => {
      return this.pending(this.contract('JUNIOR_OPERATOR').supplyOrder(supplyAmount, this.overrides))
    }

    submitJuniorRedeemOrder = async (redeemAmount: string) => {
      return this.pending(this.contract('JUNIOR_OPERATOR').redeemOrder(redeemAmount, this.overrides))
    }

    disburseJunior = async () => {
      return this.pending(this.contract('JUNIOR_OPERATOR')['disburse()'](this.overrides))
    }

    getJuniorTokenAllowance = async (owner: string) => {
      return (
        await this.contract('JUNIOR_TOKEN').allowance(owner, this.contractAddresses['JUNIOR'], this.overrides)
      ).toBN()
    }

    checkJuniorTokenMemberlist = async (user: string) => {
      return await this.contract('JUNIOR_TOKEN').hasMember(user)
    }

    approveJuniorToken = async (tokenAmount: string) => {
      return this.pending(
        this.contract('JUNIOR_TOKEN').approve(this.contractAddresses['JUNIOR'], tokenAmount, this.overrides)
      )
    }

    calcJuniorDisburse = async (user: string) => {
      return await this.contract('JUNIOR_TRANCHE')['calcDisburse(address)'](user)
    }
  }
}

export type CalcDisburseResult = {
  payoutCurrencyAmount: BN
  payoutTokenAmount: BN
  remainingSupplyCurrency: BN
  remainingRedeemToken: BN
}

export type ILenderActions = {
  getSeniorTokenAllowance(owner: string): Promise<BN>
  getJuniorTokenAllowance(owner: string): Promise<BN>
  approveJuniorToken: (tokenAmount: string) => Promise<PendingTransaction>
  approveSeniorToken: (tokenAmount: string) => Promise<PendingTransaction>
  submitSeniorSupplyOrder(supplyAmount: string): Promise<PendingTransaction>
  submitSeniorRedeemOrder(redeemAmount: string): Promise<PendingTransaction>
  submitJuniorSupplyOrder(supplyAmount: string): Promise<PendingTransaction>
  submitJuniorRedeemOrder(redeemAmount: string): Promise<PendingTransaction>
  disburseSenior(): Promise<PendingTransaction>
  disburseJunior(): Promise<PendingTransaction>
  calcJuniorDisburse(user: string): Promise<CalcDisburseResult>
  calcSeniorDisburse(user: string): Promise<CalcDisburseResult>
  checkJuniorTokenMemberlist(user: string): Promise<boolean>
  checkSeniorTokenMemberlist(user: string): Promise<boolean>
}

export default LenderActions
