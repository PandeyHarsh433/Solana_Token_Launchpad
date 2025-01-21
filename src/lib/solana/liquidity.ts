import {Connection, PublicKey, sendAndConfirmTransaction, Transaction} from '@solana/web3.js';
import {
    createInitializePoolInstruction,
    createPoolInstruction,
    Liquidity,
    LIQUIDITY_STATE_LAYOUT_V4, Token,
} from '@raydium-io/raydium-sdk';
import {ASSOCIATED_TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {SolanaError} from '../errors';

export class LiquidityService {
    private readonly connection: Connection;
    private readonly raydiumProgramId = new PublicKey(
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
    );

    constructor(connection: Connection) {
        this.connection = connection;
    }

    async createPool(
        tokenMintA: PublicKey,
        tokenMintB: PublicKey,
        userPublicKey: PublicKey,
        tokenAAmount: number,
        tokenBAmount: number,
        feeTier: number = 0
    ) {
        try {
            const tokenA = new Token(
                userPublicKey,
                tokenMintA,
                9,
            );
            const tokenB = new Token(
                userPublicKey,
                tokenMintB,
                9,
            );

            const amountA = tokenAAmount * 10 ** 9;
            const amountB = tokenBAmount * 10 ** 9;

            const [poolStateAddress] = PublicKey.findProgramAddressSync(
                [Buffer.from('raydium_lp'), tokenMintA.toBuffer(), tokenMintB.toBuffer()],
                this.raydiumProgramId
            );

            const poolCoinTokenAccount = await tokenA.getOrCreateAssociatedAccountInfo(
                poolStateAddress
            );
            const poolPcTokenAccount = await tokenB.getOrCreateAssociatedAccountInfo(
                poolStateAddress
            );
            const poolLpTokenAccount = await Liquidity.createAssociatedAccountInfo(
                poolStateAddress,
                'lp'
            );

            // Create pool instructions
            const instructions = createPoolInstruction(
                Token.programId,
                this.raydiumProgramId,
                poolStateAddress,
                ASSOCIATED_TOKEN_PROGRAM_ID,
                userPublicKey,
                tokenMintA,
                tokenMintB,
                poolCoinTokenAccount.address,
                poolPcTokenAccount.address,
                poolLpTokenAccount.address,
                userPublicKey,
                amountA,
                amountB,
                feeTier,
            );

            // Create transaction
            const transaction = new Transaction().add(...instructions);

            // Sign and send transaction
            const signature = await sendAndConfirmTransaction(
                this.connection,
                transaction,
                [userPublicKey],
                {commitment: 'confirmed'}
            );

            return {
                signature,
                poolStateAddress: poolStateAddress.toString(),
            };
        } catch (error) {
            throw new SolanaError('Failed to create pool', 'POOL_CREATION_ERROR', error);
        }
    }

    async getLiquidityPool(tokenMint: PublicKey) {
        try {
            const [poolStateAddress] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from('raydium_lp'),
                    tokenMint.toBuffer()
                ],
                this.raydiumProgramId
            );
            const accountInfo = await this.connection.getAccountInfo(poolStateAddress);
            if (!accountInfo) {
                throw new Error('Pool not found');
            }

            const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(accountInfo.data);
            return {
                address: poolStateAddress.toString(),
                tokenABalance: poolState.tokenABalance.toString(),
                tokenBBalance: poolState.tokenBBalance.toString(),
                lpSupply: poolState.lpSupply.toString(),
                currentPrice: poolState.currentPrice.toString()
            };
        } catch (error) {
            throw new SolanaError('Failed to get liquidity pool', 'POOL_ERROR', error);
        }
    }
}