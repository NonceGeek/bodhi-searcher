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
import { render } from "@deno/gfm";
import { gql } from "https://deno.land/x/graphql_tag@0.0.1/mod.ts";
import { print } from "https://deno.land/x/graphql_deno@v15.0.0/mod.ts";



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

// Helper function to escape XML special characters
function escapeXml(unsafe: string | null | undefined): string {
  if (unsafe == null) return "";
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
    }
    return c;
  });
}

async function getAssetsByAuthor(supabase, author, onlyTitle, cursor, limit) {
  let query = supabase
    .from("bodhi_text_assets")
    .select("*")
    .eq("author_true", author.toLowerCase())
    .order("id", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("id", cursor + 1);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const processedData = data.map((item) => {
    if (onlyTitle) {
      const { content, ...rest } = item;
      const lines = content?.split("\n") || [];
      const firstLine = lines.find((line) => line.trim() !== "") || ""; // Find the first non-empty line
      const abstract = firstLine.trim().startsWith("#")
        ? firstLine.trim().replace(/^#+\s*/, "") // Remove leading '#' and spaces
        : firstLine.trim();
      const fiveLine = lines.slice(1, 5).join("\n") || "";
      return { ...rest, abstract, fiveLine };
    } else {
      const { embedding, ...rest } = item;
      const lines = item.content?.split("\n") || [];
      const firstLine = lines.find((line) => line.trim() !== "") || ""; // Find the first non-empty line
      const abstract = firstLine.trim().startsWith("#")
        ? firstLine.trim().replace(/^#+\s*/, "") // Remove leading '#' and spaces
        : firstLine.trim();
      const fiveLine = lines.slice(1, 5).join("\n") || "";
      return { ...rest, abstract, fiveLine };
    }
  });

  const nextCursor = data.length === limit ? data[data.length - 1].id : null;

  return { assets: processedData, nextCursor };
}

async function getAssetsBySpace(
  supabase,
  spaceContractAddr,
  onlyTitle,
  cursor,
  limit
) {
  let query = supabase
    .from("bodhi_text_assets")
    .select()
    .eq("creator", spaceContractAddr.toLowerCase())
    .order("id", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("id", cursor + 1);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const processedData = data.map((item) => {
    if (onlyTitle) {
      const { content, ...rest } = item;
      const lines = content?.split("\n") || [];
      const firstLine = lines.find((line) => line.trim() !== "") || ""; // Find the first non-empty line
      const abstract = firstLine.trim().startsWith("#")
        ? firstLine.trim().replace(/^#+\s*/, "") // Remove leading '#' and spaces
        : firstLine.trim();
      const fiveLine = lines.slice(1, 5).join("\n") || "";
      return { ...rest, abstract, fiveLine };
    } else {
      const { embedding, ...rest } = item;
      const lines = item.content?.split("\n") || [];
      const firstLine = lines.find((line) => line.trim() !== "") || ""; // Find the first non-empty line
      const abstract = firstLine.trim().startsWith("#")
        ? firstLine.trim().replace(/^#+\s*/, "") // Remove leading '#' and spaces
        : firstLine.trim();
      const fiveLine = lines.slice(1, 5).join("\n") || "";
      return { ...rest, abstract, fiveLine };
    }
  });

  const nextCursor = data.length === limit ? data[data.length - 1].id : null;

  return { assets: processedData, nextCursor };
}

router
  .get("/embedding_search", async (context) => {
    // HINT: DO NOT DELETE: By default, the length of the embedding vector will be 1536 for text-embedding-3-small or 3072 for text-embedding-3-large .
    // & the embedding size of llama3.2 is 3072.
    const queryParams = context.request.url.searchParams;
    const modelName = queryParams.get("model") || "llama3.2";
    const key = queryParams.get("keyword");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const response = await fetch("http://localhost:11434/api/embed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        input: key
      })
    });

    const embedResult = await response.json();
    const vectorString = `[${embedResult.embeddings.join(',')}]`;
    console.log("vectorString", vectorString);

    const resp = await supabase.rpc('embedding_search_bodhi_text_assets_k_v_space_145', {
      query_embedding: vectorString,
      match_threshold: 0.5, // Choose an appropriate threshold for your data
      match_count: 10, // Choose the number of matches
    })

    console.log("resp", resp);

    context.response.body = resp;
  })
  .get("/spaces", async (context) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    try {
      // Assuming 'name' is a non-null field you want to check
      const { data, error } = await supabase
        .from("bodhi_spaces")
        .select("*")
        .not("name", "is", "NULL");

      if (error) {
        throw error;
      }

      context.response.status = 200;
      context.response.body = data; // Send the retrieved data as the response
    } catch (err) {
      console.error("Error fetching spaces:", err);
      context.response.status = 500;
      context.response.body = { error: "Failed to fetch spaces" };
    }
  })
  .get("/set_img", async (context) => {
    const queryParams = context.request.url.searchParams;
    let asset_id = parseInt(queryParams.get("asset_id"), 10);
    const category = queryParams.get("category");
    const adminKey = queryParams.get("admin_key");

    // Example: Basic admin key verification
    if (adminKey !== Deno.env.get("ADMIN_KEY")) {
      context.response.status = 403;
      context.response.body = "Unauthorized";
      return;
    }

    if (!asset_id || !category) {
      context.response.status = 400;
      context.response.body = "Missing required parameters";
      return;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data, error } = await supabase
      .from("bodhi_img_assets_k_v")
      .update({ category })
      .eq("id_on_chain", asset_id);

    if (error) {
      console.error("Error updating asset category:", error);
      context.response.status = 500;
      context.response.body = { error: "Failed to update category" };
      return;
    }

    context.response.body = { message: "Category updated successfully", data };
  })
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
  .get("/img_search", async (context) => {
    const queryParams = context.request.url.searchParams;
    const key = queryParams.get("keyword");
    const limit = parseInt(queryParams.get("limit"), 10); 
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    try {
      let query = supabase
        .from("bodhi_img_assets_k_v")
        .select("*") // Select all columns initially
        .textSearch("description", key)
        .order("id_on_chain", { ascending: false }); 

        if (!isNaN(limit) && limit > 0) {
          query = query.limit(limit); // Apply limit to the query if valid
        }
  
        const { data, error } = await query;
        
        if (error) {
          throw error;
        }
  
        context.response.status = 200;
        context.response.body = data;
      } catch (error) {
        console.error("Error fetching data:", error);
        context.response.status = 500;
        context.response.body = { error: "Failed to fetch data" };
      }
  })
  .get("/text_search", async (context) => {
    const queryParams = context.request.url.searchParams;
    const key = queryParams.get("keyword");
    const tableName = queryParams.get("table_name");
    const column = queryParams.get("column");
    const limit = parseInt(queryParams.get("limit"), 10); // Get limit from query and convert to integer
    const onlyTitle = queryParams.has("only_title"); // Check if only_title param exists
    console.log("tableName", tableName);
    // List of searchable tables
    const searchableTables = ["bodhi_text_assets", "bodhi_text_assets_k_v", "bodhi_text_assets_k_v_space_145"];

    // Check if the table is allowed to be searched
    if (!searchableTables.includes(tableName)) {
      context.response.status = 403; // Forbidden status code
      context.response.body = {
        error: "The specified table is not searchable.",
      };
      return;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("tableName", tableName);
    console.log("column", column);
    console.log("key", key);

    try {
      let query = supabase
        .from(tableName)
        .select("*") // Select all columns initially
        .textSearch(column, key)
        .order("id_on_chain", { ascending: false }); // Order results by id_on_chain in descending order

      if (!isNaN(limit) && limit > 0) {
        query = query.limit(limit); // Apply limit to the query if valid
      }

      const { data, error } = await query;

      console.log("data", data);

      if (error) {
        throw error;
      }

      // Modify data based on only_title parameter
      const processedData = data.map((item) => {
        if (onlyTitle) {
          const { content, ...rest } = item; // Exclude content from the result
          const lines = content?.split("\n") || [];
          const firstLine = lines.find((line) => line.trim() !== "") || ""; // Find the first non-empty line
          const abstract = firstLine.trim().startsWith("#")
            ? firstLine.trim().replace(/^#+\s*/, "") // Remove leading '#' and spaces
            : firstLine.trim();
          return { ...rest, abstract }; // Return other data with abstract
        } else {
          const { embedding, ...rest } = item; // Exclude embedding from the result if it exists
          return rest;
        }
      });

      context.response.status = 200;
      context.response.body = processedData;
    } catch (error) {
      console.error("Error fetching data:", error);
      context.response.status = 500;
      context.response.body = { error: "Failed to fetch data" };
    }
  })
  .get("/constant", async (context) => {
    // * get value by the key and app name.
    // TODO: impl the param parser of get/post in the scaffold-aptos.
    // 1. parse params in get req.
    const queryParams = context.request.url.searchParams;
    const key = queryParams.get("key");

    // 2. parse params in post req.
    // let content = await context.request.body.text();
    // content = JSON.parse(content);
    // const uuid = content.uuid;

    const supabase = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get("SUPABASE_URL") ?? "",
      // Supabase API ANON KEY - env var exported by default.
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      // Create client with Auth context of the user that called the function.
      // This way your row-level-security (RLS) policies are applied.
      // { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Querying data from Supabase
    const { data, error } = await supabase
      .from("bodhi_constants")
      .select("*")
      .eq("key", key)
      .single();

    if (error) {
      console.error("Error fetching data:", error);
      context.response.status = 500;
      context.response.body = "Failed to fetch data";
      return;
    }

    context.response.body = data;
  })
  .get("/imgs_page", async (context) => {
    const queryParams = context.request.url.searchParams;
    const page = parseInt(queryParams.get("page"), 10) || 1;
    const limit = parseInt(queryParams.get("limit"), 10) || 10; // Default to 10 items per page if not specified
    const category = queryParams.get("category");

    const offset = (page - 1) * limit; // Calculate offset

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let query = supabase
      .from("bodhi_img_assets_k_v")
      .select() // Select fields as needed, could specify like "id, link, metadata"
      .order("id", { ascending: false }) // Or order by any other relevant field
      //   .limit(limit)
      .range(offset, offset + limit - 1);

    if (category) {
      query = query.eq("category", category); // Filter by category if it is provided
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching images:", error);
      context.response.status = 500;
      context.response.body = { error: "Failed to fetch images" };
      return;
    }

    // Assuming 'data' contains the fetched images
    context.response.body = { images: data, page, limit };
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
  .get("/assets_index_latest", async (context) => {
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
      .from("bodhi_indexer")
      .select("index")
      .eq("name", "bodhi")
      .single();
    context.response.body = data;
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
    const onlyTitle = queryParams.has("only_title"); // Check if only_title param exists
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

      const processedData = data.map((item) => {
        if (onlyTitle) {
          const { content, ...rest } = item; // Exclude content from the result
          const lines = content?.split("\n") || [];
          const firstLine = lines.find((line) => line.trim() !== "") || ""; // Find the first non-empty line
          const abstract = firstLine.trim().startsWith("#")
            ? firstLine.trim().replace(/^#+\s*/, "") // Remove leading '#' and spaces
            : firstLine.trim();
          return { ...rest, abstract }; // Return other data with abstract
        } else {
          const { embedding, ...rest } = item; // Exclude embedding from the result if it exists
          return rest;
        }
      });

      context.response.body = { assets: processedData };
      return;
    }

    if (queryParams.has("space_addr")) {
      console.log("B"); // If space_id is in params, print "B"
      context.response.body = "Assets Endpoint Hit";
    }
  })
  // TODO: more abstract the APIs.
  .get("/assets_by_table_name", async (context) => {
    // Create a Supabase client with the Auth context of the logged in user.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      // To implement row-level security (RLS), uncomment and adjust the following lines:
      // , {
      //   global: {
      //     headers: { Authorization: `Bearer ${context.request.headers.get('Authorization')}` }
      //   }
      // }
    );

    const queryParams = context.request.url.searchParams;
    const tableName = queryParams.get("table_name");

    try {
      // Define a basic select query for fetching all data from the first table
      let query = supabase.from(tableName).select("*");

      // Execute the first query
      const { data: initialData, error: initialError } = await query;

      if (initialError) {
        throw initialError;
      }

      // Extract the id_on_chain values from the initial query result
      const idOnChains = initialData.map((item) => item.id_on_chain);

      // Execute the second query using the id_on_chain values to fetch from bodhi_text_assets
      const { data: secondaryData, error: secondaryError } = await supabase
        .from("bodhi_text_assets")
        .select("*")
        .in("id_on_chain", idOnChains);

      if (secondaryError) {
        throw secondaryError;
      }

      // Create a map from id_on_chain to category and type from initialData
      const categoryTypeMap = initialData.reduce((acc, item) => {
        acc[item.id_on_chain] = { category: item.category, type: item.type };
        return acc;
      }, {});

      // Append category and type to each item in secondaryData
      const enrichedSecondaryData = secondaryData.map((item) => {
        return {
          ...item,
          ...categoryTypeMap[item.id_on_chain], // Merge category and type based on id_on_chain
        };
      });

      // Return the enriched secondaryData as a JSON response.
      context.response.body = enrichedSecondaryData;
      context.response.status = 200;
    } catch (err) {
      console.error("Failed to fetch data:", err);
      context.response.status = 500;
      context.response.body = { error: "Failed to fetch data" };
    }
  })
  .get("/assets_by_space_v2", async (context) => {
    // Create a Supabase client with the Auth context of the logged in user.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      // To implement row-level security (RLS), uncomment and adjust the following lines:
      // , {
      //   global: {
      //     headers: { Authorization: `Bearer ${context.request.headers.get('Authorization')}` }
      //   }
      // }
    );

    const queryParams = context.request.url.searchParams;
    const spaceContractAddr = queryParams.get("space_addr") + "_indexer";

    // Check if 'type' parameter exists and set the variable accordingly
    let typeFilter = queryParams.has("type") ? queryParams.get("type") : null;
    let categoryFilter = queryParams.has("category")
      ? queryParams.get("category")
      : null;

    try {
      // Define a basic select query for fetching all data from the first table
      let query = supabase.from(spaceContractAddr).select("*");

      // If typeFilter is set, modify the query to filter by 'type' column
      if (typeFilter) {
        query = query.eq("type", typeFilter);
      }

      if (categoryFilter) {
        query = query.eq("category", categoryFilter);
      }

      // Execute the first query
      const { data: initialData, error: initialError } = await query;

      if (initialError) {
        throw initialError;
      }

      // Extract the id_on_chain values from the initial query result
      const idOnChains = initialData.map((item) => item.id_on_chain);

      // Execute the second query using the id_on_chain values to fetch from bodhi_text_assets
      const { data: secondaryData, error: secondaryError } = await supabase
        .from("bodhi_text_assets")
        .select("*")
        .in("id_on_chain", idOnChains);

      if (secondaryError) {
        throw secondaryError;
      }

      // Create a map from id_on_chain to category and type from initialData
      const categoryTypeMap = initialData.reduce((acc, item) => {
        acc[item.id_on_chain] = { category: item.category, type: item.type };
        return acc;
      }, {});

      // Append category and type to each item in secondaryData
      const enrichedSecondaryData = secondaryData.map((item) => {
        return {
          ...item,
          ...categoryTypeMap[item.id_on_chain], // Merge category and type based on id_on_chain
        };
      });

      // Return the enriched secondaryData as a JSON response.
      context.response.body = enrichedSecondaryData;
      context.response.status = 200;
    } catch (err) {
      console.error("Failed to fetch data:", err);
      context.response.status = 500;
      context.response.body = { error: "Failed to fetch data" };
    }
  })

  .get("/assets_by_space", async (context) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const queryParams = context.request.url.searchParams;
    const onlyTitle = queryParams.has("only_title");
    const spaceContractAddr = queryParams.get("space_addr");
    let cursor = queryParams.get("cursor");
    const limit = parseInt(queryParams.get("limit") || "10", 10);

    if (!spaceContractAddr) {
      context.response.status = 400;
      context.response.body = { error: "space_addr parameter is required" };
      return;
    }

    try {
      const result = await getAssetsBySpace(
        supabase,
        spaceContractAddr,
        onlyTitle,
        cursor,
        limit
      );
      context.response.body = result;
    } catch (err) {
      console.error("Error fetching assets by space:", err);
      context.response.status = 500;
      context.response.body = { error: "Failed to fetch assets by space" };
    }
  })
  .get("/collections", async (context) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    try {
      const { data, error } = await supabase
        .from("bodhi_collections")
        .select("*");

      if (error) {
        throw error;
      }

      context.response.status = 200;
      context.response.body = data; // Send the retrieved data as the response
    } catch (err) {
      console.error("Error fetching collections:", err);
      context.response.status = 500;
      context.response.body = { error: "Failed to fetch collections" };
    }
  })

  .get("/gen_rss", async (context) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const queryParams = context.request.url.searchParams;
    let author = queryParams.get("author");

    const title = queryParams.get("title") || "RSS Feed";
    const description = queryParams.get("description") || "Generated RSS feed";
    const cursor = queryParams.get("cursor") || null;
    const limit = queryParams.get("limit") || 100;

    if (!author) {
      context.response.status = 400;
      context.response.body = { error: "Author parameter is required" };
      return;
    }

    try {
      // Query the bodhi_rss_feeds table
      const { data: rssData, error: rssError } = await supabase
        .from("bodhi_rss_feeds")
        .select("feed_id, user_id")
        .eq("unique_id", author.toLowerCase())
        .single();

      if (rssError) {
        console.error("The feed is not verified yet:", rssError);
      }

      const result = await getAssetsByAuthor(
        supabase,
        author,
        false,
        cursor,
        limit
      );
      // Generate RSS XML
      context.response.headers.set(
        "Content-Type",
        "application/rss+xml; charset=utf-8"
      );
      const rssItems = result.assets
        .map(
          (asset) => `
        <item>
          <title>${escapeXml(asset.abstract)}</title>
          <link>https://bodhi.wtf/${asset.id_on_chain}</link>
          <guid>https://bodhi.wtf/${asset.id_on_chain}</guid>
          <pubDate>${new Date(asset.created_at).toUTCString()}</pubDate>
          <description><![CDATA[${render(asset.fiveLine)}]]></description>
          <content:encoded><![CDATA[
            ${render(asset.content)}
            <div style="display: flex; justify-content: center; align-items: center; margin: 0 auto;">
              <a href="https://bodhi.wtf/${asset.id_on_chain}">
                <button style="background-color: rgb(0, 95, 189) !important; color: white !important; border: none; border-radius: 4px; font-size: 18px; cursor: pointer; font-weight: 400; padding: 10px 16px; line-height: 1.3333333;">
                  Comment 留言
                </button>
              </a>
              <a href="https://bodhi.wtf/${asset.id_on_chain}?action=buy">
                <button style="background-color: rgb(0, 95, 189) !important; color: white !important; border: none; border-radius: 4px; font-size: 18px; cursor: pointer; font-weight: 400; padding: 10px 16px; line-height: 1.3333333;">
                  Buy Shares 购买份额
                </button>
              </a>
            </div>
          ]]></content:encoded>
          <author>${escapeXml(author)}</author>
        </item>
      `
        )
        .join("");

      let feedIdUserIdString = "";
      if (rssData) {
        feedIdUserIdString = ` feedId:${rssData.feed_id}+userId:${rssData.user_id}`;
      }

      const rss = `<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>${escapeXml(title)}</title>
          <link>https://bodhi.wtf/address/${author}</link>
          <description>${escapeXml(
            description
          )}${feedIdUserIdString}</description>
          <language>zh-cn</language>
          ${rssItems}
        </channel>
      </rss>`;

      context.response.body = rss;
    } catch (err) {
      console.error("Error generating RSS:", err);
      context.response.status = 500;
      context.response.body = { error: "Failed to generate RSS feed" };
    }
  })
  .get("/gen_rss_by_space", async (context) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const queryParams = context.request.url.searchParams;
    const spaceContractAddr = queryParams.get("space_addr");
    const cursor = queryParams.get("cursor") || null;
    const limit = parseInt(queryParams.get("limit") || "100", 10);

    if (!spaceContractAddr) {
      context.response.status = 400;
      context.response.body = { error: "space_addr parameter is required" };
      return;
    }

    try {
      // Query the bodhi_spaces table to get the id_on_chain
      const { data: spaceData, error: spaceError } = await supabase
        .from("bodhi_spaces")
        .select()
        .eq("contract_addr", spaceContractAddr)
        .single();

      if (spaceError || !spaceData) {
        throw new Error("Space not found");
      }

      const spaceIdOnChain = spaceData.id_on_chain;

      // Query the bodhi_rss_feeds table
      const { data: rssData, error: rssError } = await supabase
        .from("bodhi_rss_feeds")
        .select("feed_id, user_id")
        .eq("unique_id", spaceContractAddr.toLowerCase())
        .single();

      if (rssError) {
        console.error("The feed is not verified yet:", rssError);
      }

      const result = await getAssetsBySpace(
        supabase,
        spaceContractAddr,
        false,
        cursor,
        limit
      );

      // Generate RSS XML
      context.response.headers.set(
        "Content-Type",
        "application/rss+xml; charset=utf-8"
      );
      const rssItems = result.assets
        .map(
          (asset) => `
        <item>
          <title>${escapeXml(asset.abstract)}</title>
          <link>https://bodhi.wtf/space/${spaceIdOnChain}/${
            asset.id_on_chain
          }</link>
          <guid>https://bodhi.wtf/space/${spaceIdOnChain}/${
            asset.id_on_chain
          }</guid>
          <pubDate>${new Date(asset.created_at).toUTCString()}</pubDate>
          <description><![CDATA[${render(asset.fiveLine)}]]></description>
          <content:encoded><![CDATA[
            ${render(asset.content)}
            <a href="https://bodhi.wtf/${asset.id_on_chain}">
                <button style="background-color: rgb(0, 95, 189) !important; color: white !important; border: none; border-radius: 4px; font-size: 18px; cursor: pointer; font-weight: 400; padding: 10px 16px; line-height: 1.3333333;">
                  Comment 留言
                </button>
              </a>
              <a href="https://bodhi.wtf/${asset.id_on_chain}?action=buy">
                <button style="background-color: rgb(0, 95, 189) !important; color: white !important; border: none; border-radius: 4px; font-size: 18px; cursor: pointer; font-weight: 400; padding: 10px 16px; line-height: 1.3333333;">
                  Buy Shares 购买份额
                </button>
              </a>
          ]]></content:encoded>
          <author>${escapeXml(spaceData.name)}</author>
        </item>
      `
        )
        .join("");

      let feedIdUserIdString = "";
      if (rssData) {
        feedIdUserIdString = ` feedId:${rssData.feed_id}+userId:${rssData.user_id}`;
      }

      const rss = `<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>${spaceData.name}</title>
          <link>https://bodhi.wtf/space/${spaceIdOnChain}</link>
          <description>${escapeXml(
            spaceData.description.replace(/\n/g, " ")
          )}${feedIdUserIdString}</description>
          <language>zh-cn</language>
          ${rssItems}
        </channel>
      </rss>`;

      context.response.body = rss;
    } catch (err) {
      console.error("Error generating RSS for space:", err);
      context.response.status = 500;
      context.response.body = {
        error: "Failed to generate RSS feed for space",
      };
    }
  })
  .get("/assets_by_author", async (context) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const queryParams = context.request.url.searchParams;
    const author = queryParams.get("author");
    const onlyTitle = queryParams.has("only_title");
    let cursor = queryParams.get("cursor");
    cursor = parseInt(cursor, 10);
    const limit = parseInt(queryParams.get("limit") || "10", 10);

    if (!author) {
      context.response.status = 400;
      context.response.body = { error: "Author parameter is required" };
      return;
    }

    try {
      const result = await getAssetsByAuthor(
        supabase,
        author,
        onlyTitle,
        cursor,
        limit
      );
      context.response.status = 200;
      context.response.body = result;
    } catch (err) {
      console.error("Error fetching assets by author:", err);
      context.response.status = 500;
      context.response.body = { error: "Failed to fetch assets by author" };
    }
  })
  // curl -X GET 'https://bodhi-data.deno.dev/set_rss?addr=0x1234567890abcdef&type=author&title=John%20Doe&description=My%20awesome%20RSS%20feed&user_id=12345&feed_id=67890'
  .get("/set_rss", async (context) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const queryParams = context.request.url.searchParams;
    const addr = queryParams.get("addr");
    const type = queryParams.get("type");
    const title = queryParams.get("title");
    const description = queryParams.get("description");
    const user_id = queryParams.get("user_id");
    const feed_id = queryParams.get("feed_id");

    if (!addr || !type || !user_id || !feed_id) {
      context.response.status = 400;
      context.response.body = {
        error: "All parameters (addr, type, user_id, feed_id) are required",
      };
      return;
    }

    try {
      // First, check if an entry with the given address already exists
      const { data: existingData, error: existingError } = await supabase
        .from("bodhi_rss_feeds")
        .select("*")
        .eq("unique_id", addr.toLowerCase())
        .single();

      if (existingError && existingError.code !== "PGRST116") {
        // PGRST116 is the error code for "Results contain 0 rows" in PostgREST
        throw existingError;
      }

      if (existingData) {
        context.response.status = 200;
        context.response.body = {
          message: "RSS feed already verified",
          data: existingData,
        };
        return;
      }

      // If no existing entry, proceed with insertion
      const { data, error } = await supabase.from("bodhi_rss_feeds").insert({
        unique_id: addr.toLowerCase(),
        type,
        title,
        description,
        user_id,
        feed_id,
      });

      if (error) {
        throw error;
      }

      context.response.status = 200;
      context.response.body = {
        message: "RSS feed information updated successfully",
        data,
      };
    } catch (err) {
      console.error("Error updating RSS feed information:", err);
      context.response.status = 500;
      context.response.body = {
        error: "Failed to update RSS feed information",
      };
    }
  })
  .get("/assets_by_parent", async (context) => {
    const queryParams = context.request.url.searchParams;
    // const spaceId = queryParams.get("space_id");
    const parentId = queryParams.get("parent_id");

    if (!parentId) {
      context.response.status = 400;
      context.response.body = {
        error: "space_id and parent_id parameters are required",
      };
      return;
    }

    const query = gql`
    query GetSpacePostsBySpaceIdAndParentId($parentId: String!) {
        spacePosts(where: { parentId: $parentId }) {
          id
          assetId
          creator {
            id
            address
          }
          asset {
            id
            arTxId
          }
          isRoot
          rootId
          totalReplies
          removedFromSpace
        }
      }
    `;

    // const queryString = print(query);

    // console.log(queryString);

    const variables = {
      parentId,
    };

    const THE_GRAPH_API_KEY = Deno.env.get("THE_GRAPH_API_KEY");
    if (!THE_GRAPH_API_KEY) {
      console.error(
        "THE_GRAPH_API_KEY is not set in the environment variables"
      );
      context.response.status = 500;
      context.response.body = { error: "Server configuration error" };
      return;
    }

    console.log(query);
    try {
      const response = await fetch(
        `https://gateway-arbitrum.network.thegraph.com/api/${THE_GRAPH_API_KEY}/subgraphs/id/9wbJZrTfDRf7uF8Db9XTUq9Fezzn58EgbLfV26LnXKke`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: print(query),
            variables: variables,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(result);
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      context.response.status = 200;
      context.response.body = {
        data: result.data,
      };
    } catch (err) {
      console.error("Error fetching space posts:", err);
      context.response.status = 500;
      context.response.body = { error: "Failed to fetch space posts" };
    }
  })
  .get("/gen_rss_by_post", async (context) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const queryParams = context.request.url.searchParams;
    const spaceId = queryParams.get("space_id");
    const parentId = queryParams.get("parent_id");
    const title = queryParams.get("title") || "Bodhi Space Post RSS Feed";
    const description = queryParams.get("description") || "RSS feed for Bodhi space post and its replies";

    if (!spaceId || !parentId) {
      context.response.status = 400;
      context.response.body = { error: "space_id and parent_id parameters are required" };
      return;
    }

    try {
      // Fetch RSS feed information
      const { data: rssData, error: rssError } = await supabase
        .from("bodhi_rss_feeds")
        .select("feed_id, user_id")
        .eq("unique_id", parentId)
        .single();

      if (rssError && rssError.code !== "PGRST116") {
        console.error("Error fetching RSS feed information:", rssError);
      }

      let feedIdUserIdString = "";
      if (rssData) {
        feedIdUserIdString = ` feedId:${rssData.feed_id}+userId:${rssData.user_id}`;
      }

      // Fetch space posts from The Graph
      const query = gql`
        query GetSpacePostsBySpaceIdAndParentId($spaceId: String!, $parentId: String!) {
          spacePosts(where: { spaceId: $spaceId, parentId: $parentId }) {
            id
            assetId
            creator {
              address
            }
            asset {
              arTxId
            }
            isRoot
            rootId
            totalReplies
          }
        }
      `;

      const variables = { spaceId, parentId };

      const graphResponse = await fetch(
        `https://gateway-arbitrum.network.thegraph.com/api/${Deno.env.get("THE_GRAPH_API_KEY")}/subgraphs/id/9wbJZrTfDRf7uF8Db9XTUq9Fezzn58EgbLfV26LnXKke`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: print(query), variables }),
        }
      );

      if (!graphResponse.ok) {
        throw new Error(`HTTP error! status: ${graphResponse.status}`);
      }

      const graphResult = await graphResponse.json();
      if (graphResult.errors) {
        throw new Error(graphResult.errors[0].message);
      }

      const spacePosts = graphResult.data.spacePosts;
      const assetIds = spacePosts.map(post => post.assetId);

      // Fetch content from Supabase
      const { data: assets, error } = await supabase
        .from("bodhi_text_assets")
        .select("*")
        .in("id_on_chain", assetIds);

      if (error) {
        throw error;
      }

      // Sort assets by id_on_chain in descending order
      assets.sort((a, b) => b.id_on_chain - a.id_on_chain);

      // Generate RSS XML
      context.response.headers.set("Content-Type", "application/rss+xml; charset=utf-8");

      const rssItems = assets.map(asset => {
        const spacePost = spacePosts.find(post => post.assetId === asset.id_on_chain);
        
        // Extract title from the first line of content
        const lines = asset.content.split('\n');
        const title = lines[0].replace(/^#+\s*/, '').trim() || "No title";
        
        return `
          <item>
            <title>${escapeXml(title)}</title>
            <link>https://bodhi.wtf/space/${spaceId}/${asset.id_on_chain}</link>
            <guid>https://bodhi.wtf/space/${spaceId}/${asset.id_on_chain}</guid>
            <pubDate>${new Date(asset.created_at).toUTCString()}</pubDate>
            <description><![CDATA[${render(asset.content.slice(0, 500))}...]]></description>
            <content:encoded><![CDATA[
              ${render(asset.content)}

              <div style="display: flex; justify-content: center; align-items: center; margin: 0 auto;">
                <a href="https://bodhi.wtf/space/${spaceId}/${asset.id_on_chain}">
                  <button style="background-color: rgb(0, 95, 189) !important; color: white !important; border: none; border-radius: 4px; font-size: 18px; cursor: pointer; font-weight: 400; padding: 10px 16px; line-height: 1.3333333;">
                    Comment 留言
                  </button>
                </a>
                <a href="https://bodhi.wtf/space/${spaceId}/${asset.id_on_chain}?action=buy">
                  <button style="background-color: rgb(0, 95, 189) !important; color: white !important; border: none; border-radius: 4px; font-size: 18px; cursor: pointer; font-weight: 400; padding: 10px 16px; line-height: 1.3333333;">
                    Buy Shares 购买份额
                  </button>
                </a>
              </div>
            ]]></content:encoded>
            <author>${escapeXml(asset.author_true)}</author>
          </item>
        `;
      }).join("");

      const rss = `<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>${escapeXml(title)}</title>
          <link>https://bodhi.wtf/space/${spaceId}/${parentId}</link>
          <description>${escapeXml(description)}${feedIdUserIdString}</description>
          <language>en-us</language>
          ${rssItems}
        </channel>
      </rss>`;

      context.response.body = rss;
    } catch (err) {
      console.error("Error generating RSS for space post:", err);
      context.response.status = 500;
      context.response.body = { error: "Failed to generate RSS feed for space post" };
    }
  });

const app = new Application();
app.use(oakCors()); // Enable CORS for All Routes
app.use(router.routes());

console.info("CORS-enabled web server listening on port 8000");
await app.listen({ port: 8000 });
