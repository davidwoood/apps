import { Stack, Text } from '@centrifuge/fabric'
import { useLocation } from 'react-router'
import { PageHeader } from '../components/PageHeader'
import { RouterLinkButton } from '../components/RouterLinkButton'

export default function NotFoundPag() {
  return <Pools />
}

function Pools() {
  const location = useLocation()

  return (
    <Stack gap={8} flex={1}>
      <PageHeader title="Page not found" />
      <Stack alignItems="center" gap="4">
        <Text variant="label1">The page {location.pathname} does not exist</Text>
        <RouterLinkButton variant="secondary" to="/">
          Go to the home page
        </RouterLinkButton>
      </Stack>
    </Stack>
  )
}
