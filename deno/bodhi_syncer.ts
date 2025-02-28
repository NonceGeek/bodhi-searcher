// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://cdn.skypack.dev/ethers@5.6.8";

import { gql } from "https://deno.land/x/graphql_tag@0.0.1/mod.ts";
import { print } from "https://deno.land/x/graphql_deno@v15.0.0/mod.ts";

console.log("Hello from Functions!");

const GET_SPACE_POST_CREATE_EVENTS = gql`
  query getSpacePostCreateEvents($assetId: Int!) {
    spacePostCreateEvents(where: { assetId: $assetId }) {
      id
      space {
        id
        spaceName
      }
      spaceId
      parentId
      assetId
      creator {
        id
        address
      }
      blockNumber
      blockTimestamp
      transactionHash
    }
  }
`;

async function getSpacePostCreateEvent(assetId: number) {
  const response = await fetch(
    `https://gateway-arbitrum.network.thegraph.com/api/${Deno.env.get(
      "THE_GRAPH_API_KEY"
    )}/subgraphs/id/9wbJZrTfDRf7uF8Db9XTUq9Fezzn58EgbLfV26LnXKke`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: print(GET_SPACE_POST_CREATE_EVENTS),
        variables: {
          assetId: assetId,
        },
      }),
    }
  );

  console.log("response", response);

  const data = await response.json();
  console.log(data);
  return data.data.spacePostCreateEvents;
}



// Configuration for your smart contract
const contractABI = [
  "function assetIndex() view returns (uint256)",
  "function assets(uint256 index) view returns (uint256, string, address)",
  "function CREATOR_FEE_PERCENT() view returns (uint256)",
  "function CREATOR_PREMINT() view returns (uint256)",
  "function balanceOf(address, uint256) view returns (uint256)",
  "function balanceOfBatch(address[], uint256[]) view returns (uint256[])",
  "function buy(uint256 assetId, uint256 amount) payable",
  "function create(string arTxId)",
  "function getAssetIdsByAddress(address) view returns (uint256[])",
  "function getBuyPrice(uint256 assetId, uint256 amount) view returns (uint256)",
  "function getBuyPriceAfterFee(uint256 assetId, uint256 amount) view returns (uint256)",
  "function getPrice(uint256 supply, uint256 amount) pure returns (uint256)",
  "function getSellPrice(uint256 assetId, uint256 amount) view returns (uint256)",
  "function getSellPriceAfterFee(uint256 assetId, uint256 amount) view returns (uint256)",
  "function isApprovedForAll(address, address) view returns (bool)",
  "function pool(uint256) view returns (uint256)",
  "function remove(uint256 assetId)",
  "function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  "function sell(uint256 assetId, uint256 amount)",
  "function setApprovalForAll(address operator, bool approved)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function totalSupply(uint256) view returns (uint256)",
  "function txToAssetId(bytes32) view returns (uint256)",
  "function uri(uint256 id) view returns (string)",
  "function userAssets(address, uint256) view returns (uint256)",
];
const contractAddress = "0x2ad82a4e39bac43a54ddfe6f94980aaf0d1409ef";


const contractABIFac = [
  "function spaceIndex() view returns (uint256)",
  "function spaces(uint256) view returns (address)",
  "function create(uint256 assetId, string spaceName)",
  "event Create(uint256 spaceId, address indexed spaceAddress, uint256 indexed assetId, address creator, string spaceName)"
];

const contractAddressFactory = "0xa14d19387c83b56343fc2e7a8707986af6a74d08";

// Provider URL, you should replace it with your actual Optimism provider
const provider = new ethers.providers.JsonRpcProvider(
  "https://mainnet.optimism.io"
);

const contract = new ethers.Contract(contractAddress, contractABI, provider);

const contractFactory = new ethers.Contract(contractAddressFactory, contractABIFac, provider);

// <!-- factory contract interactors
async function getSpaceIndexFromContractFactory() {
  const indexOnChain = await contractFactory.spaceIndex();
  return indexOnChain.toNumber(); // Convert BigInt to number
}

async function getSpaceFromContractFactory(index: number) {
  const space = await contractFactory.spaces(index);
  return space;
}

// <!-- contract interactors
async function getIndexFromContract() {
  try {
    const indexOnChain = await contract.assetIndex();
    return indexOnChain.toNumber(); // Convert BigInt to number
  } catch (error) {
    console.error("Error fetching index from contract:", error);
    throw error;
  }
}

async function getAssetFromContract(index: number) {
  const asset = await contract.assets(index);
  // Create a new array with the modified value
  const modifiedAsset = [asset[0].toNumber(), asset[1], asset[2]];
  return modifiedAsset;
}

// -->

// <!-- arweave getter
async function fetchArweaveContent(arweaveId: string) {
  const arweaveUrl = `https://arweave.net/${arweaveId}`;
  const response = await fetch(arweaveUrl);
  console.log("response", response);
  const contentType = response.headers.get("content-type");
  const body = await response.text();
  return { contentType, body };
}
// -->

const router = new Router();

router
  .get("/get_post_create_event", async (context) => {
    const queryParams = context.request.url.searchParams;
    const assetId = parseInt(queryParams.get("asset_id") || "0");

    if (assetId === 0) {
      context.response.status = 400;
      context.response.body = { error: "Invalid asset_id parameter" };
      return;
    }

    try {
      const events = await getSpacePostCreateEvent(assetId);
      context.response.body = { events };
    } catch (error) {
      context.response.status = 500;
      context.response.body = { error: error };
    }
  })
  .get("/sync_latest_fac_index", async (context) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    
    const { data, _error } = await supabase
      .from("bodhi_indexer")
      .select("index")
      .eq("name", "spaceFactory");

    let index_now = data[0].index;

    const index_on_chain = await getSpaceIndexFromContractFactory();
    console.log("index_on_chain", index_on_chain);
    const { _data, error_insert } = await supabase
    .from("bodhi_spaces")
    .insert({
      contract_addr: "abcd",
      id_on_chain: 3
    });

    if (index_on_chain > index_now) {
      let i;
      for (i = index_now + 1; i <= index_on_chain - 1; i++) {
        const space = await getSpaceFromContractFactory(i);
        console.log("space", space);
        
        const { _data, error_insert } = await supabase
          .from("bodhi_spaces")
          .insert({
            contract_addr: space.toLowerCase(),
            id_on_chain: i
          });

        console.log("error_insert", error_insert);
        
        const { error } = await supabase
          .from("bodhi_indexer")
          .update({ index: i })
          .eq("name", "spaceFactory");
        console.log("error", error);
      }
    }
    
    context.response.body = { index: index_on_chain };
  })
  .get("/embedding", async (context) => {
    const queryParams = context.request.url.searchParams;
    const modelName = queryParams.get("model") || "llama3.2";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let hasMoreRecords = true;
    let processedCount = 0;

    while (hasMoreRecords) {
      // Get batch of records that need embedding
      const { data, error } = await supabase
        // .from("bodhi_text_assets_k_v_space_145")
        .from("bodhi_text_assets_k_v")
        .select("id, data")
        .is("embedding_3072", null)
        .limit(50);
      console.log("handling 50 items...");
      if (error) {
        console.error("Error fetching data:", error);
        context.response.body = { 
          error: "Failed to fetch data",
          processedCount 
        };
        return;
      }

      // If no more records need processing, exit loop
      if (!data || data.length === 0) {
        hasMoreRecords = false;
        break;
      }

      // Process current batch
      for (const item of data) {
        console.log("Processing item", item.id);
        try {
          const response = await fetch("http://localhost:11434/api/embed", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: modelName,
              input: item.data
            })
          });

          const embedResult = await response.json();
          const vectorString = `[${embedResult.embeddings.join(',')}]`;
          
          const { error: updateError } = await supabase
            // .from("bodhi_text_assets_k_v_space_145")
            .from("bodhi_text_assets_k_v")
            .update({ embedding_3072: vectorString })
            .eq("id", item.id);

          if (updateError) {
            console.error("Error updating embedding for id", item.id, ":", updateError);
          } else {
            processedCount++;
          }

        } catch (err) {
          console.error("Error processing item", item.id, ":", err);
        }
      }

      // Optional: Add a small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    context.response.body = { 
      message: "All embeddings completed", 
      processedCount 
    };
  })
  .get("/sync_latest_index", async (context) => {
    const supabase = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get("SUPABASE_URL") ?? "",
      // Supabase API ANON KEY - env var exported by default.
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      // Create client with Auth context of the user that called the function.
      // This way your row-level-security (RLS) policies are applied.
      // { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data, _error } = await supabase
      .from("bodhi_indexer")
      .select("index")
      .eq("id", 1);

    let index_now = data[0].index;

    const index_on_chain = await getIndexFromContract();
    console.log("index_on_chain", index_on_chain);
    if (index_on_chain > index_now) {
      // get the asset from the contract sync to supabase. from index_on_chain to index_now
      let i;
      for (i = index_now + 1; i <= index_on_chain - 1; i++) {
        const asset = await getAssetFromContract(i);
        console.log("asset", asset);
        // "function assets(uint256 index) view returns (uint256, string, address)"
        const { _data, error_insert } = await supabase
          .from("bodhi_raw_assets")
          .insert({
            id_on_chain: asset[0],
            ar_tx_id: asset[1],
            creator: asset[2],
          });

        console.log("error_insert", error_insert);
        // Update the index to the supabase.
        const { error } = await supabase
          .from("bodhi_indexer")
          .update({ index: i })
          .eq("id", 1);
        console.log("error", error);
      }
    }
    // return the index_on_chain
    context.response.body = { index: index_on_chain };
  })
  .get("/arweave_getter", async (context) => {
    const queryParams = context.request.url.searchParams;
    let arweave_id = queryParams.get("arweave_id");
    const { contentType } = await fetchArweaveContent(arweave_id);
    context.response.body = { contentType };
  })
  .post("/to_text_database", async (context) => {
    let content = await context.request.body.text();
    content = JSON.parse(content);

    console.log("content", content);

    const arTxId = content.record.ar_tx_id;

    try {
      // 1. Get Arweave content by the ar_tx_id
      const { contentType, body } = await fetchArweaveContent(arTxId);
      console.log("body", body);
      console.log("contentType", contentType);
      // DO NOT DELETE THIS ONE!
      // content {
      //   type: "INSERT",
      //   table: "bodhi_raw_assets",
      //   record: {
      //     id: 30622,
      //     creator: "0x6f1B3533cf48b96514Db0CEB28FD7209cD28eEcC",
      //     ar_tx_id: "Ar4Y3QY2m-u6gDuTBIKIaQbXLMhR1ILkCVS_Y50sJXk",
      //     created_at: "2024-11-03T03:19:01.383315+00:00",
      //     id_on_chain: 15429,
      //     if_handled_to_bodhi_img_assets: false,
      //     if_handled_to_bodhi_text_assets: false
      //   },
      //   schema: "public",
      //   old_record: null
      // }

      // 2. If header including "Content-Type" is "text/markdown", then insert to bodhi_text_assets
      if (contentType?.includes("text/markdown")) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );
        console.log("markdown.");

        // insert to next dataset
        await supabase.from("bodhi_text_assets").insert({
          id_on_chain: content.record.id_on_chain,
          content: body,
          creator: content.record.creator,
        });

        // change the status of the original dataset
        await supabase
          .from("bodhi_raw_assets")
          .update({
            if_handled_to_bodhi_text_assets: true,
          })
          .eq("id_on_chain", content.record.id_on_chain);
      } else {
        console.log("other stuff.");
      }
    } catch (error) {
      console.error("Error fetching or processing Arweave content:", error);
    }
  })
  .get("/get_true_creator", async (context) => {
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
      .from("bodhi_text_assets")
      .select()
      .or('space_contract_addr.is.null,space_contract_addr.eq.""')
      .order("id", { ascending: false }); // Sorts the data by 'id' in descending order
    console.log("error", error);
    console.log("datadata", data);
    let item;
    for (item in data) {

      console.log(data[item].creator);
      const { data: spacesData, error: spacesError } = await supabase
        .from("bodhi_spaces")
        .select()
        .eq("contract_addr", data[item].creator.toLowerCase());

      console.log("spacesData", spacesData);
      console.log("spacesError", spacesError);

      if (spacesData.length === 0) {
        await supabase
          .from("bodhi_text_assets")
          .update({
            space_contract_addr: "0x0",
            author_true: data[item].creator,
          })
          .eq("id_on_chain", data[item].id_on_chain);
      } else {
        // get_true_creator
        // Use getSpacePostCreateEvent to get the true creator
        console.log("item", item);
        const events = await getSpacePostCreateEvent(data[item].id_on_chain);
        const trueCreatorAddress = events[0]?.creator?.address;
        await supabase
          .from("bodhi_text_assets")
          .update({
            space_contract_addr: data[item].creator.toLowerCase(),
            author_true: trueCreatorAddress,
          })
          .eq("id_on_chain", data[item].id_on_chain);
      }
    }
    context.response.body = { result: "done" };
  })
  // HINT: A FUNCTION FOR TEMP DATA TRANSFER.
  // .get("/to_bodhi_text_assets_k_v_space_145", async (context) => {
  //   const supabase = createClient(
  //     // Supabase API URL - env var exported by default.
  //     Deno.env.get("SUPABASE_URL") ?? "",
  //     // Supabase API ANON KEY - env var exported by default.
  //     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  //     // Create client with Auth context of the user that called the function.
  //     // This way your row-level-security (RLS) policies are applied.
  //     // { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  //   );
  //     // select the data which id from 15494 to 15497 from bodhi_text_assets_k_v
  //     const { data, error } = await supabase
  //       .from("bodhi_text_assets_k_v")
  //       .select()
  //       .gte("id_on_chain", 15494)
  //       .lte("id_on_chain", 15497);
  //     console.log("data", data);
  //     console.log("error", error);
  //     // insert to bodhi_text_assets_k_v_space_145
  //     for (const item of data) {
  //       await supabase.from("bodhi_text_assets_k_v_space_145").insert({
  //         data: item.data,
  //         metadata: item.metadata,
  //         creator: item.creator,
  //         id_on_chain: item.id_on_chain,
  //       });
  //     }
  // })
  .post("/to_bodhi_text_assets_k_v", async (context) => {
    const supabase = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get("SUPABASE_URL") ?? "",
      // Supabase API ANON KEY - env var exported by default.
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      // Create client with Auth context of the user that called the function.
      // This way your row-level-security (RLS) policies are applied.
      // { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    let content = await context.request.body.text();
    content = JSON.parse(content);
    // DO NOT DELETE THIS ONE!
    // content {
    //   type: "INSERT",
    //   table: "bodhi_text_assets",
    //   record: {
    //     id: 1542,
    //     tags: {},
    //     likes: 0,
    //     content: "![](https://arweave.net/gjcPeqM29ISuA9usviwO_-3v9G2_iVn1vWrWlwqbpIU)\r\n" +
    //       "\r\n" +
    //       "每天 10 小时的工作，榨干了我和我的小伙伴\r\n" +
    //       "\r\n",
    //     creator: "0x6f1B3533cf48b96514Db0CEB28FD7209cD28eEcC",
    //     created_at: "2024-11-03T03:34:04.101981+00:00",
    //     author_true: null,
    //     id_on_chain: 15429,
    //     share_holders: [],
    //     space_contract_addr: null,
    //     if_to_text_assets_k_v: false
    //   },
    //   schema: "public",
    //   old_record: null
    // }
    console.log("content", content);
    const { creator, id_on_chain, content: textContent } = content.record;

    const paragraphs = textContent.split("\r\n");
    const filteredParagraphs = paragraphs.filter(
      (paragraph) => paragraph.trim() !== ""
    );
    for (const paragraph of filteredParagraphs) {

      if (creator.toLowerCase() === "0xca9252a60403199c092cbb4bd99b8fc7626dee3a") {
        // it's a article in xiaolai space, to handle it spec.
        await supabase.from("bodhi_text_assets_k_v_space_145").insert({
          data: paragraph,
          metadata: {
            creator: creator,
            id_on_chain: id_on_chain,
            type: "text/markdown; charset=utf-8",
          },
          creator: creator,
          id_on_chain: id_on_chain,
        });
      }

      const { error } = await supabase.from("bodhi_text_assets_k_v").insert({
        data: paragraph,
        metadata: {
          creator: creator,
          id_on_chain: id_on_chain,
          type: "text/markdown; charset=utf-8",
        },
        creator: creator,
        id_on_chain: id_on_chain,
      });
      console.log("error in to_bodhi_text_assets_k_v", error);

      // If no error, update the bodhi_text_assets table
      if (!error) {
        await supabase
          .from("bodhi_text_assets")
          .update({
            if_to_text_assets_k_v: true,
          })
          .eq("id_on_chain", id_on_chain);
      }
    }
  });

const app = new Application();
app.use(oakCors()); // Enable CORS for All Routes
app.use(router.routes());

console.info("CORS-enabled web server listening on port 8000");
await app.listen({ port: 8000 });

// To invoke:
// curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/' \
//   --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
//   --header 'Content-Type: application/json' \
//   --data '{"name":"Functions"}'
