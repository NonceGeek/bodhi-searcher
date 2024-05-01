/* export APIs to the Bodhi ecology, including the follow APIs:
- read bodhi text assets
- read bodhi pic assets
- read bodhi assets sliced
- read bodhi spaces
- using bodhi as a auth? That may be c00l.
*/
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.
import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";

// for ether
import { ethers } from "https://cdn.skypack.dev/ethers@5.6.8";



import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("Hello from Functions!")

const router = new Router();

// Configuration for your smart contract
const contractABI = [
// Include only the necessary ABI details for balanceOf
    "function balanceOf(address owner, uint256 asset_id) view returns (uint256)"
];
const contractAddress = "0x2ad82a4e39bac43a54ddfe6f94980aaf0d1409ef";

// Provider URL, you should replace it with your actual Optimism provider
const provider = new ethers.providers.JsonRpcProvider("https://mainnet.optimism.io");

const contract = new ethers.Contract(contractAddress, contractABI, provider);

async function checkTokenHold(addr, assetId, minHold) {
    try {
        // Call the balanceOf function
        const balance = await contract.balanceOf(addr, assetId);

        // Convert balance from BigInt to a number in ethers and adjust for token decimals (18 decimals)
        const balanceInEth = parseFloat(ethers.utils.formatUnits(balance, 18));

        // Compare the balance against the minimum hold requirement
        return balanceInEth >= minHold;
    } catch (error) {
        console.error("Error accessing the contract or parsing balance:", error);
        return false;
    }
}

router
    .get("/bodhi_auth", async(context) =>{

        // 1. verify that addr, msg and signature is valid(验证签名).
        // 2. check the token hodl(检查持仓).

        
        // Assuming the URL might be "/bodhi_auth?addr=0x00&msg=abcdefg&signature=0x01&asset_id=1&hold=0.001"
        const queryParams = context.request.url.searchParams;
        const addr = queryParams.get('addr');
        const msg = queryParams.get('msg');
        const signature = queryParams.get('signature');
        // const assetId = queryParams.get('asset_id'); // Example usage
        const hold = queryParams.get('hold'); // Example usage

        let if_pass = false;

        // Example usage
        const assetId = 14020; // Example usage
        const minHold = 0.001;  // Minimum required balance

        // if_pass = await checkTokenHold(addr, assetId, minHold);
        try {
            // 1. Verify the signature
            // const messageHash = ethers.utils.hashMessage(msg);
            const recoveredAddr = ethers.utils.verifyMessage(msg, signature);

            if (recoveredAddr.toLowerCase() === addr.toLowerCase()) {
                // 2. Check token hold (This part would need actual logic to check token holdings)
                // Assuming the logic to check token holdings is implemented elsewhere
                // if (checkTokenHold(addr, asset_id, hold)) {
                //     if_pass = true;
                // }

                // Simulate token hold check for demonstration purposes
                if_pass = await checkTokenHold(addr, assetId, minHold);
            }
        } catch (error) {
            console.error("Error verifying signature or checking token hold:", error);
        }

        if(if_pass){
            context.response.body = {"result": "Auth Pass, You could see the secrect things now!"};
        }else{
            context.response.body = {"result": "Auth unPass"};
        }
        
    })
  .get("/assets", async(context) =>{
    // Create a Supabase client with the Auth context of the logged in user.
    const supabase = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get('SUPABASE_URL') ?? '',
      // Supabase API ANON KEY - env var exported by default.
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      // Create client with Auth context of the user that called the function.
      // This way your row-level-security (RLS) policies are applied.
      // { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Assuming the URL might be "/assets?asset_id=123&space_id=456"
    const queryParams = context.request.url.searchParams;
    
    if (queryParams.has('asset_id')) {
        console.log("A"); // If asset_id is in params, print "A"
    }

    if (queryParams.has('space_addr')) {
        console.log("B"); // If space_id is in params, print "B"
    }

    context.response.body = "Assets Endpoint Hit";
  });

const app = new Application();
app.use(oakCors()); // Enable CORS for All Routes
app.use(router.routes());

console.info("CORS-enabled web server listening on port 8000");
await app.listen({ port: 8000 });
