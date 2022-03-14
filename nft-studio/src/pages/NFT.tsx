import { Box, Button, IconArrowLeft, IconArrowRight, IconNft, IconPlus, Shelf, Stack, Text } from '@centrifuge/fabric'
import * as React from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { BuyDialog } from '../components/BuyDialog'
import { useCentrifuge } from '../components/CentrifugeProvider'
import { Identity } from '../components/Identity'
import { PageHeader } from '../components/PageHeader'
import { AnchorPillButton } from '../components/PillButton'
import { RemoveListingDialog } from '../components/RemoveListingDialog'
import { RouterLinkButton } from '../components/RouterLinkButton'
import { SellDialog } from '../components/SellDialog'
import { PageWithSideBar } from '../components/shared/PageWithSideBar'
import { SplitView } from '../components/SplitView'
import { TransferDialog } from '../components/TransferDialog'
import { nftMetadataSchema } from '../schemas'
import { parseMetadataUrl } from '../utils/parseMetadataUrl'
import { useAddress } from '../utils/useAddress'
import { useCollection, useCollectionMetadata } from '../utils/useCollections'
import { useMetadata } from '../utils/useMetadata'
import { useNFT } from '../utils/useNFTs'
import { usePermissions } from '../utils/usePermissions'
import { isSameAddress } from '../utils/web3'

export const NFTPage: React.FC = () => {
  return (
    <PageWithSideBar>
      <NFT />
    </PageWithSideBar>
  )
}

const NFT: React.FC = () => {
  const { cid: collectionId, nftid: nftId } = useParams<{ cid: string; nftid: string }>()

  const address = useAddress()
  const { data: permissions } = usePermissions(address)
  const nft = useNFT(collectionId, nftId)
  const { data: nftMetadata } = useMetadata(nft?.metadataUri, nftMetadataSchema)
  const collection = useCollection(collectionId)
  const { data: collectionMetadata } = useCollectionMetadata(collection?.id)
  const [transferOpen, setTransferOpen] = React.useState(false)
  const [sellOpen, setSellOpen] = React.useState(false)
  const [buyOpen, setBuyOpen] = React.useState(false)
  const [unlistOpen, setUnlistOpen] = React.useState(false)
  const centrifuge = useCentrifuge()

  const imageUrl = nftMetadata?.image ? parseMetadataUrl(nftMetadata.image) : ''

  const isLoanCollection = collection?.admin ? centrifuge.utils.isLoanPalletAccount(collection.admin) : true
  const canCreateLoan =
    !isLoanCollection && permissions && Object.values(permissions).some((p) => p.roles.includes('Borrower'))

  return (
    <Stack gap={8} flex={1}>
      <Box>
        <PageHeader
          parent={{ label: collectionMetadata?.name ?? 'Collection', to: `/collection/${collectionId}` }}
          title={nftMetadata?.name ?? 'Unnamed NFT'}
          subtitle={
            collection && (
              <>
                by <Identity address={collection.owner} clickToCopy />
              </>
            )
          }
          actions={
            <>
              {nft &&
                address &&
                (isSameAddress(nft.owner, address) ? (
                  <>
                    {canCreateLoan && (
                      <RouterLinkButton
                        to={`/collection/${collectionId}/object/${nftId}/new-asset`}
                        icon={IconPlus}
                        small
                        variant="text"
                      >
                        Create asset
                      </RouterLinkButton>
                    )}
                    {nft.sellPrice !== null ? (
                      <Button onClick={() => setUnlistOpen(true)} small variant="text">
                        Remove listing
                      </Button>
                    ) : (
                      <Button onClick={() => setSellOpen(true)} small variant="text">
                        Sell
                      </Button>
                    )}
                    <Button
                      onClick={() => setTransferOpen(true)}
                      icon={IconArrowRight}
                      small
                      variant="text"
                      disabled={nft.sellPrice !== null}
                    >
                      Transfer
                    </Button>
                    <TransferDialog
                      collectionId={collectionId}
                      nftId={nftId}
                      open={transferOpen}
                      onClose={() => setTransferOpen(false)}
                    />
                    <SellDialog
                      collectionId={collectionId}
                      nftId={nftId}
                      open={sellOpen}
                      onClose={() => setSellOpen(false)}
                    />
                    <BuyDialog
                      collectionId={collectionId}
                      nftId={nftId}
                      open={buyOpen}
                      onClose={() => setBuyOpen(false)}
                    />
                    <RemoveListingDialog
                      collectionId={collectionId}
                      nftId={nftId}
                      open={unlistOpen}
                      onClose={() => setUnlistOpen(false)}
                    />
                  </>
                ) : (
                  <>
                    {nft.sellPrice !== null && (
                      <Button onClick={() => setBuyOpen(true)} small>
                        Buy
                      </Button>
                    )}
                    <BuyDialog
                      collectionId={collectionId}
                      nftId={nftId}
                      open={buyOpen}
                      onClose={() => setBuyOpen(false)}
                    />
                  </>
                ))}
            </>
          }
        />
        <Box mt={1}>
          <RouterLinkButton icon={IconArrowLeft} to="/nfts" variant="text">
            Back
          </RouterLinkButton>
        </Box>
      </Box>
      <SplitView
        left={
          <Box display="flex" alignItems="center" justifyContent="center" py={8} height="100%">
            {imageUrl ? (
              <Box as="img" maxHeight="80vh" src={imageUrl} />
            ) : (
              <Box
                bg="borderSecondary"
                display="flex"
                alignItems="center"
                justifyContent="center"
                maxHeight="60vh"
                maxWidth="60vh"
                borderRadius="10px"
                style={{ aspectRatio: '1 / 1' }}
              >
                <IconNft color="backgroundPrimary" size="50%" />
              </Box>
            )}
          </Box>
        }
        right={
          <Shelf
            px={[2, 4, 8]}
            gap={[4, 4, 8]}
            alignItems="flex-start"
            justifyContent="space-between"
            flexDirection={['column', 'row', 'column']}
          >
            {!nft && (
              <Stack gap={3}>
                <Text variant="headingLarge" as="h1">
                  NFT Not Found
                </Text>
              </Stack>
            )}
            {nft && collection && (
              <>
                <Stack gap={3}>
                  {/* <Stack>
                  <Text variant="label1">Creation date</Text>
                  <Text variant="heading3">
                    {metadata.createdAt &&
                      new Date(metadata.createdAt).toLocaleDateString('en', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                  </Text>
                </Stack> */}

                  <Stack gap={1} mb={6}>
                    <NavLink to={`/collection/${collectionId}`}>
                      <Text variant="heading3" underline>
                        {collectionMetadata?.name}
                      </Text>
                    </NavLink>
                    <Text variant="heading1" fontSize="36px" fontWeight="700" mb="4px">
                      {nftMetadata?.name}
                    </Text>
                    <Shelf gap={1}>
                      <Text variant="heading3" color="textSecondary">
                        by
                      </Text>
                      <AnchorPillButton
                        href={`${process.env.REACT_APP_SUBSCAN_URL}/account/${nft.owner}`}
                        target="_blank"
                      >
                        <Identity address={collection.owner} clickToCopy />
                      </AnchorPillButton>
                    </Shelf>
                  </Stack>

                  <Stack gap={1}>
                    <Text variant="label1">Description</Text>
                    <Text variant="body2" style={{ wordBreak: 'break-word' }}>
                      {nftMetadata?.description || 'No description'}
                    </Text>
                  </Stack>

                  {imageUrl && (
                    <Stack gap={1} alignItems="flex-start">
                      <Text variant="label1">Image</Text>
                      <AnchorPillButton
                        href={imageUrl}
                        target="_blank"
                        style={{ wordBreak: 'break-all', whiteSpace: 'initial' }}
                      >
                        Source file
                      </AnchorPillButton>
                    </Stack>
                  )}

                  <Stack gap={1}>
                    <Text variant="label1">Owner</Text>
                    <Text variant="label2" color="textPrimary">
                      <Identity address={nft.owner} clickToCopy />
                    </Text>
                  </Stack>

                  {nft.sellPrice !== null && (
                    <Stack gap={1}>
                      <Text variant="label1">Price</Text>
                      <Text variant="heading3">{centrifuge.utils.formatCurrencyAmount(nft.sellPrice, 'AIR')}</Text>
                    </Stack>
                  )}
                </Stack>
              </>
            )}
          </Shelf>
        }
      />
    </Stack>
  )
}
