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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

console.log("Hello from Functions!");

const router = new Router();

// Configuration for your smart contract
const contractABI = [
  // Include only the necessary ABI details for balanceOf
  "function balanceOf(address owner, uint256 asset_id) view returns (uint256)",
];
const contractAddress = "0x2ad82a4e39bac43a54ddfe6f94980aaf0d1409ef";

// Provider URL, you should replace it with your actual Optimism provider
const provider = new ethers.providers.JsonRpcProvider(
  "https://mainnet.optimism.io"
);

const contract = new ethers.Contract(contractAddress, contractABI, provider);

// img checker.
function containsImage(markdownString) {
  const regex = /!\[.*?\]\((.*?)\)/;
  return regex.test(markdownString);
}

function extractImageLink(markdownImageString: string): string | null {
  // Regular expression to match the format ![some_text](url)
  const regex = /!\[.*?\]\((.*?)\)/;

  // Use the regex to find matches
  const match = markdownImageString.match(regex);

  // If a match is found and it has a group capture, return the URL
  if (match && match[1]) {
    return match[1];
  }

  // If no match is found, return null
  return null;
}

// balance checker.
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
  .get("/", async (context) => {
    context.response.body = { result: "Hello World!" };
  })
  .get("/imgs_latest_id", async (context) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Query to get the row with the maximum ID
    const { data, error } = await supabase
      .from("bodhi_img_assets_k_v")
      .select("id") // Assuming 'id' is the primary key or a unique identifier
      .order("id", { ascending: false }) // Order by id descending
      .limit(1); // Only fetch one record

    if (error) {
      console.error("Error fetching the latest ID:", error);
      context.response.status = 500;
      context.response.body = { error: "Failed to fetch the latest ID" };
      return;
    }

    // Assuming 'data' contains the fetched row, and you're extracting 'id'
    const latestId = data && data.length > 0 ? data[0].id : null;

    // Return the latest ID
    context.response.body = { latestId: latestId };
  })
  .get("/imgs", async (context) => {
    let cursor = context.request.url.searchParams.get("cursor");
    let limit = context.request.url.searchParams.get("limit");
    let category = context.request.url.searchParams.get("category");

    cursor = parseInt(cursor, 10);
    limit = limit ? parseInt(limit, 10) : 10;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const query = supabase
      .from("bodhi_img_assets_k_v")
      .select() // Select fields you need
      .order("created_at", { ascending: false }) // Sorting by 'created_at' in descending order
      .limit(limit);

    if (cursor) {
      query.lt("id", cursor + 1); // Fetch records newer than the cursor
    }

    // Apply the category filter condition
    if (category) {
      query.eq("category", category); // Filter by category
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching images:", error);
      context.response.status = 500;
      context.response.body = { error: "Failed to fetch images" };
      return;
    }

    // Assuming 'data' contains the fetched images
    context.response.body = { images: data };
  })
  .get("/batch_to_img", async (context) => {
    const supabase = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get("SUPABASE_URL") ?? "",
      // Supabase API ANON KEY - env var exported by default.
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      // Create client with Auth context of the user that called the function.
      // This way your row-level-security (RLS) policies are applied.
      // { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data, error } = await supabase
      .from("bodhi_text_assets_k_v")
      .select()
      .eq("if_to_img_assets", 0);
    // .eq('id', 9324);
    console.log("error:", error);
    // for all the data

    for (const item of data) {
      console.log("handle item:", item.id);
      const hasImage = containsImage(item.data); // Assuming 'content' contains the markdown text
      console.log("hasImage:", hasImage);
      const newValue = hasImage ? 2 : 1; // If it has image, set to 2, otherwise set to 1
      if (newValue == 2) {
        console.log("detect img item:", item.id);
        // Insert into bodhi_img_assets_k_v, omitting the embedding field
        // Function to extract image link from Markdown content
        const imgLink = extractImageLink(item.data);

        // Prepare the item for insertion by omitting certain fields
        const itemToInsert = {
          id_on_chain: item.id_on_chain,
          creator: item.creator,
          created_at: item.created_at,
          metadata: item.metadata,
          link: imgLink, // Set the extracted image link
        };

        const insertResponse = await supabase
          .from("bodhi_img_assets_k_v")
          .insert([itemToInsert]);

        if (insertResponse.error) {
          console.log(
            `Failed to insert item ${item.id} into bodhi_img_assets_k_v:`,
            insertResponse.error
          );
        } else {
          console.log(
            `Item ${item.id} inserted into bodhi_img_assets_k_v successfully.`
          );
        }
      }

      // update the bodhi_text_assets_k_v table.
      const updateResponse = await supabase
        .from("bodhi_text_assets_k_v")
        .update({ if_to_img_assets: newValue })
        .match({ id: item.id }); // Assuming 'id' is the primary key of the table

      if (updateResponse.error) {
        console.log(`Failed to update item ${item.id}:`, updateResponse.error);
      } else {
        console.log(`Item ${item.id} updated successfully.`);
      }
    }
    context.response.body = { result: "batch to img done" };
  })
  .get("/bodhi_auth", async (context) => {
    // 1. verify that addr, msg and signature is valid(验证签名).
    // 2. check the token hodl(检查持仓).

    // Assuming the URL might be "/bodhi_auth?addr=0x00&msg=abcdefg&signature=0x01&asset_id=1&hold=0.001"
    const queryParams = context.request.url.searchParams;
    const addr = queryParams.get("addr");
    const msg = queryParams.get("msg");
    const signature = queryParams.get("signature");
    // const assetId = queryParams.get('asset_id'); // Example usage
    const hold = queryParams.get("hold"); // Example usage

    let if_pass = false;

    // Example usage
    const assetId = 14020; // Example usage
    const minHold = 0.001; // Minimum required balance

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

    if (if_pass) {
      context.response.body = {
        result: "Auth Pass, You could see the secrect things now!",
      };
    } else {
      context.response.body = { result: "Auth unPass" };
    }
  })
  .get("/assets", async (context) => {
    // Create a Supabase client with the Auth context of the logged in user.
    const supabase = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get("SUPABASE_URL") ?? "",
      // Supabase API ANON KEY - env var exported by default.
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      // Create client with Auth context of the user that called the function.
      // This way your row-level-security (RLS) policies are applied.
      // { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Assuming the URL might be "/assets?asset_begin=0&asset_end=10&space_id=456"
    const queryParams = context.request.url.searchParams;

    if (queryParams.has("asset_begin")) {
      // Done: get data from asset begin to asset to, return the arrary of assets in bodhi_text_assets which id_on_chain = asset_num
      const assetBegin = parseInt(queryParams.get("asset_begin"), 10);
      const assetEnd = parseInt(queryParams.get("asset_end"), 10);

      if (isNaN(assetBegin) || isNaN(assetEnd)) {
        context.response.status = 400;
        context.response.body = "Invalid asset range provided";
        return;
      }

      // Fetch assets within the range from the database
      const { data, error } = await supabase
        .from("bodhi_text_assets")
        .select()
        .gte("id_on_chain", assetBegin)
        .lte("id_on_chain", assetEnd)
        .order("id_on_chain", { ascending: true });

      if (error) {
        console.error("Error fetching assets:", error);
        context.response.status = 500;
        context.response.body = { error: "Failed to fetch assets" };
        return;
      }

      context.response.body = { assets: data };
      return;
    }

    if (queryParams.has("space_addr")) {
      console.log("B"); // If space_id is in params, print "B"
      context.response.body = "Assets Endpoint Hit";
    }
  });

const app = new Application();
app.use(oakCors()); // Enable CORS for All Routes
app.use(router.routes());

console.info("CORS-enabled web server listening on port 8000");
await app.listen({ port: 8000 });
