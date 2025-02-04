import { Rate, WriteOffGroup } from '@centrifuge/centrifuge-js'
import { useCentrifugeConsts, useCentrifugeTransaction } from '@centrifuge/centrifuge-react'
import { Box, Button, Shelf, Stack, StatusChip } from '@centrifuge/fabric'
import { FieldArray, Form, FormikErrors, FormikProvider, setIn, useFormik } from 'formik'
import * as React from 'react'
import { useParams } from 'react-router'
import { ButtonGroup } from '../../../components/ButtonGroup'
import { Column, DataTable } from '../../../components/DataTable'
import { PageSection } from '../../../components/PageSection'
import { formatPercentage } from '../../../utils/formatting'
import { useSuitableAccounts } from '../../../utils/usePermissions'
import { useLoanChanges, useWriteOffGroups } from '../../../utils/usePools'
import { WriteOffInput } from './WriteOffInput'

export type Row = WriteOffGroup

type WriteOffGroupInput = {
  days: number | ''
  writeOff: number | ''
  penaltyInterest: number | ''
}

const columns: Column[] = [
  {
    align: 'left',
    header: 'Days after expected repayment date',
    cell: (row: Row) => row.overdueDays,
  },
  {
    align: 'right',
    header: 'Write-off',
    cell: (row: Row) => formatPercentage(row.percentage.toPercent()),
  },
  {
    align: 'right',
    header: 'Penalty fee',
    cell: (row: Row) => formatPercentage(row.penaltyInterestRate.toPercent()),
  },
]

const createEmptyWriteOffGroup = (): WriteOffGroupInput => ({
  days: '',
  writeOff: '',
  penaltyInterest: '',
})

export type WriteOffGroupValues = { writeOffGroups: WriteOffGroupInput[] }

export function WriteOffGroups() {
  const { pid: poolId } = useParams<{ pid: string }>()

  if (!poolId) throw new Error('Pool not found')

  const [isEditing, setIsEditing] = React.useState(false)
  const consts = useCentrifugeConsts()
  const [account] = useSuitableAccounts({ poolId, poolRole: ['PoolAdmin'] })
  const { policyChanges } = useLoanChanges(poolId)
  const latestPolicyChange = policyChanges?.at(-1)

  const { execute: executeApply, isLoading: isApplyLoading } = useCentrifugeTransaction(
    'Apply write-off policy',
    (cent) => cent.pools.applyWriteOffPolicyUpdate
  )

  const savedGroups = useWriteOffGroups(poolId)
  const sortedSavedGroups = [...(savedGroups ?? [])].sort((a, b) => a.overdueDays - b.overdueDays)

  const { execute, isLoading } = useCentrifugeTransaction(
    'Update write-off policy',
    (cent) => cent.pools.updateWriteOffPolicy,
    {
      onSuccess: () => {
        setIsEditing(false)
      },
    }
  )
  const initialValues = React.useMemo(
    () => ({
      writeOffGroups: savedGroups?.length
        ? savedGroups.map((g) => ({
            days: g.overdueDays,
            writeOff: g.percentage.toPercent().toNumber(),
            penaltyInterest: g.penaltyInterestRate.toPercent().toNumber(),
          }))
        : [createEmptyWriteOffGroup()],
    }),
    [savedGroups]
  )

  const form = useFormik<WriteOffGroupValues>({
    initialValues: { writeOffGroups: [] },
    validate: (values) => {
      let errors: FormikErrors<any> = {}
      const writeOffGroups = [...values.writeOffGroups]
        .filter((g) => typeof g.days === 'number')
        .sort((a, b) => (a.days as number) - (b.days as number))
      let highestWriteOff = 0
      let highestPenalty = 0
      let previousDays = -1
      writeOffGroups.forEach((g) => {
        if ((g.writeOff as number) <= highestWriteOff) {
          let index = values.writeOffGroups.findIndex((gr) => gr.days === g.days && gr.writeOff === g.writeOff)
          index = index === -1 ? 0 : index
          errors = setIn(
            errors,
            `writeOffGroups.${index}.writeOff`,
            'Write-off percentage must increase as days increase'
          )
        } else {
          highestWriteOff = g.writeOff as number
        }

        if ((g.penaltyInterest as number) < highestPenalty) {
          let index = values.writeOffGroups.findIndex((gr) => gr.days === g.days && gr.writeOff === g.writeOff)
          index = index === -1 ? 0 : index
          errors = setIn(
            errors,
            `writeOffGroups.${index}.penaltyInterest`,
            'Penalty fee must stay equal or increase as days increase'
          )
        } else {
          highestPenalty = g.penaltyInterest as number
        }

        if (g.days === previousDays) {
          const index = values.writeOffGroups.findIndex((gr) => gr.days === g.days && gr.writeOff === g.writeOff)
          errors = setIn(errors, `writeOffGroups.${index}.days`, 'Days must be unique')
        }
        previousDays = g.days as number
      })
      if (highestWriteOff !== 100) {
        errors = setIn(
          errors,
          `writeOffGroups.${values.writeOffGroups.length - 1}.writeOff`,
          'Must have one group with 100% write-off'
        )
      }

      return errors
    },
    onSubmit: async (values, actions) => {
      const writeOffGroups = values.writeOffGroups.map((g) => ({
        overdueDays: g.days as number,
        percentage: Rate.fromPercent(g.writeOff),
        penaltyInterestRate: Rate.fromPercent(g.penaltyInterest),
      }))
      execute([poolId, writeOffGroups], { account })
      actions.setSubmitting(false)
    },
  })

  React.useEffect(() => {
    if (isEditing && !isLoading) return
    form.resetForm()
    form.setValues(initialValues, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues, isEditing])

  const addButton = (
    <FieldArray name="writeOffGroups">
      {(fldArr) => (
        <Button
          variant="secondary"
          onClick={() => {
            fldArr.push(createEmptyWriteOffGroup())
          }}
          small
          key="edit"
          disabled={form.values.writeOffGroups.length >= consts.loans.maxWriteOffPolicySize || !account}
        >
          Add another
        </Button>
      )}
    </FieldArray>
  )

  return (
    <FormikProvider value={form}>
      <Form>
        <PageSection
          title={
            <Shelf gap={1}>
              Write-off policy{' '}
              {latestPolicyChange && latestPolicyChange.status !== 'ready' && (
                <StatusChip status="info">Pending changes</StatusChip>
              )}
            </Shelf>
          }
          headerRight={
            <>
              {isEditing ? (
                <ButtonGroup variant="small">
                  <Button variant="secondary" onClick={() => setIsEditing(false)} small>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    small
                    loading={isLoading || form.isSubmitting}
                    loadingMessage={isLoading || form.isSubmitting ? 'Pending...' : undefined}
                    disabled={!account}
                    key="done"
                  >
                    Done
                  </Button>
                </ButtonGroup>
              ) : (
                <ButtonGroup>
                  {latestPolicyChange?.status === 'ready' && (
                    <Button
                      small
                      loading={isApplyLoading}
                      disabled={!account}
                      onClick={() => executeApply([poolId, latestPolicyChange.hash], { account })}
                      key="apply"
                    >
                      Apply changes
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => setIsEditing(true)} small>
                    Edit
                  </Button>
                </ButtonGroup>
              )}
            </>
          }
        >
          <Stack gap={3}>
            {isEditing ? (
              <>
                <WriteOffInput />
                <Box>{addButton}</Box>
              </>
            ) : (
              <DataTable data={sortedSavedGroups} columns={columns} />
            )}
          </Stack>
        </PageSection>
      </Form>
    </FormikProvider>
  )
}
