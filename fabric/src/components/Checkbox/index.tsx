import * as React from 'react'
import styled from 'styled-components'
import { Box } from '../Box'
import { Flex } from '../Flex'
import { Shelf } from '../Shelf'
import { Stack } from '../Stack'
import { Text } from '../Text'

type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string | React.ReactElement
  errorMessage?: string
  extendedClickArea?: boolean
}

export function Checkbox({ label, errorMessage, extendedClickArea, ...checkboxProps }: CheckboxProps) {
  return (
    <Box position="relative">
      <StyledLabel $extendedClickArea={!!extendedClickArea}>
        <Shelf as={Text} gap={1} alignItems="flex-start" position="relative">
          <StyledWrapper minWidth="18px" height="18px" flex="0 0 18px" $hasLabel={!!label}>
            <StyledCheckbox type="checkbox" {...checkboxProps} />
            <StyledOutline />
          </StyledWrapper>
          {label && (
            <Stack gap={1} flex={1}>
              {typeof label === 'string' && (
                <Text variant="body1" color={checkboxProps.disabled ? 'textDisabled' : 'textPrimary'}>
                  {label}
                </Text>
              )}
              {React.isValidElement(label) && label}
              {errorMessage && (
                <Text variant="label2" color="statusCritical">
                  {errorMessage}
                </Text>
              )}
            </Stack>
          )}
        </Shelf>
      </StyledLabel>
      {!label && errorMessage && (
        <Box mt={1}>
          <Text variant="label2" color="statusCritical">
            {errorMessage}
          </Text>
        </Box>
      )}
    </Box>
  )
}

const StyledLabel = styled.label<{ $extendedClickArea: boolean }>`
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;

  &:before {
    --offset: 10px;

    content: '';
    display: ${({ $extendedClickArea }) => ($extendedClickArea ? 'block' : 'none')};
    position: absolute;
    top: calc(var(--offset) * -1);
    left: calc(var(--offset) * -1);
    width: calc(100% + var(--offset) * 2);
    height: calc(100% + var(--offset) * 2);
    background-color: ${({ theme }) => theme.colors.borderPrimary};
    border-radius: ${({ theme }) => theme.radii.tooltip}px;
    opacity: 0;
    transition: opacity 0.1s linear;
  }

  &:hover:before {
    opacity: 1;
  }
`

const StyledWrapper = styled(Flex)<{ $hasLabel: boolean }>`
  position: relative;
  align-items: center;

  &::before {
    content: '.';
    width: 0;
    visibility: hidden;
    align-self: center;
  }
`

const StyledCheckbox = styled.input`
  width: 18px;
  height: 18px;
  appearance: none;
  border-radius: 2px;
  border: 1px solid ${({ theme }) => theme.colors.borderPrimary};
  position: relative;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;

  ${({ theme }) => `
      &:checked {
        border-color: ${theme.colors.borderSecondary};
        background-color: ${theme.colors.textGold};
      }

      &:checked::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 5px;
        width: 6px;
        height: 10px;
        border: solid white;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }
    `}

  &:focus-visible {
    outline: none;
  }
`

const StyledOutline = styled.span`
  display: none;
  pointer-events: none;
  position: absolute;
  top: -4px;
  right: -4px;
  bottom: -4px;
  left: -4px;
  width: auto;
  height: auto;
  margin: auto;
  border: 2px solid var(--fabric-focus);
  border-radius: 100%;
`
