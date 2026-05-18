export const FAKEOUT_CONTRACT_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`

export const GOOD_DOLLAR_ADDRESS =
  (import.meta.env.VITE_GOOD_DOLLAR_ADDRESS ?? '0x62B8B11039FcfE5aB0C56E502b1C372A3d462a4f') as `0x${string}`

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const
