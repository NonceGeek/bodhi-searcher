import { SetStateAction, useEffect, useRef, useState } from "react";
import { NextPage } from "next";
// import { type } from "os";
import ReactMarkdown from "react-markdown";
import { parseEther } from "viem";
import { useScaffoldContractRead, useScaffoldContractWrite } from "~~/hooks/scaffold-eth";

//定义一个新的数据类型来记录后端返回的数据
export type resultByDataset = {
  dataset_id: string;
  results: search_result[];
};
//定义一个数据类型来记录每个搜索结果
export type search_result = {
  id: string;
  data: string;
  // eslint-disable-next-line @typescript-eslint/ban-types
  metadata: {};
};

function timeout(delay: number) {
  return new Promise(res => setTimeout(res, delay));
}

const ETHSpace: NextPage = () => {
  //在对后端发起求后，将response的内容保存在results中
  //如果用户选择使用mixed模式，则使用resultByDataset来记录结果
  const [res, setRes] = useState<resultByDataset[]>([]);
  //设置默认是在我们提供的数据集而不是公共数据集中查询
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [datasetList, _setDatasetList] = useState(false);
  //获取目前提供的数据集选项
  const [options, setOptions] = useState<string[]>([]);
  // const [itemId, setItemId] = useState<number>();
  //获取用户选择的数据集
  const [dataset, setDataset] = useState("mixed");
  //获取用户搜索的prompt
  const [searchPrompt, setSearchPrompt] = useState("");
  //仅在组件挂载时执行一次获取数据集列表

  // Ref to attach to the audio element

  useEffect(() => {
    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const setParam = urlParams.get('set');
    
    // Default options
    const defaultOptions = ["bodhi-text-contents", "xiaolai", "bodhi-imgs"];
    
    // If set parameter exists, filter options to only include that value
    if (setParam) {
      const filteredOptions = defaultOptions.filter(option => option === setParam);
      setOptions(filteredOptions.length > 0 ? filteredOptions : defaultOptions);
      // Also set the dataset to match the parameter
      if (filteredOptions.length > 0) {
        setDataset(setParam);
      }
    } else {
      setOptions(defaultOptions);
    }
  }, []); // Empty dependency array means this runs once on mount

  // const { data: totalCounter } = useScaffoldContractRead({
  //   contractName: "vectorTagger",
  //   functionName: "vectorName",
  //   args: [],
  // });

  // new feature
  const handleEnterPress = (event: { key: string }) => {
    if (event.key === "Enter") {
      console.log("Enter Enter Key! ");
      handleonClick();
    }
    // TODO: maybe set an EGG here.
  };

  // Ref to attach to the audio element
  const audioRef = useRef(null);

  // State to manage playing state
  const [isPlaying, setIsPlaying] = useState(false);

  const [assetId, setAssetId] = useState(0);
  const { writeAsync, isLoading, isMining } = useScaffoldContractWrite({
    contractName: "vectorTagger",
    functionName: "tagItem",
    args: [assetId, JSON.stringify({ like: true })],
    value: parseEther("0"),
    blockConfirmations: 1,
    onBlockConfirmation: txnReceipt => {
      console.log("Transaction blockHash", txnReceipt.blockHash);
    },
  });

  const likeAsset = (assetId: SetStateAction<number>) => {
    setAssetId(assetId);
    writeAsync();
  };
  // Function to toggle music play/pause
  const togglePlayPause = () => {
    const prevValue = isPlaying;
    setIsPlaying(!prevValue);
    if (!prevValue) {
      audioRef.current.play();
    } else {
      audioRef.current.pause();
    }
  };

  const handleonClick = async () => {
    console.log("searchPrompt: " + searchPrompt);

    // Determine the URL based on the selected dataset
    let url;
    if (dataset === "bodhi-imgs") {
      url = new URL("https://bodhi-data.deno.dev/img_search");
    } else {
      url = new URL("https://bodhi-data.deno.dev/text_search");
      // Set different table name based on dataset
      if (dataset === "xiaolai") {
        url.searchParams.append("table_name", "bodhi_text_assets_space_145");
      } else {
        url.searchParams.append("table_name", "bodhi_text_assets");
      }
      url.searchParams.append("column", "content");
    }

    // Append the keyword to the URL
    url.searchParams.append("keyword", searchPrompt);

    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("res", res);

      if (!res.ok) throw new Error("Network response was not ok");

      const data = await res.json();

      if (dataset !== "bodhi-imgs") {
        // record the user search history.
        await fetch("https://embedding-search.deno.dev/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: searchPrompt,
          }),
        });

        const resultsWithAbstract = data.map(item => {
          // Extract the first line of the content as the abstract
          const firstNewLineIndex = item.content.indexOf("\n");
          const abstract = firstNewLineIndex !== -1 ? item.content.substring(0, firstNewLineIndex) : item.content;
          return {
            ...item,
            abstract: abstract,
          };
        });

        // Assuming the API returns data in a format that can be directly used or adjust as needed
        const res1 = {
          dataset_id: dataset,
          results: resultsWithAbstract,
        };

        console.log("res1: ", res1);
        setRes([res1]); // Assuming setRes is the function to update your component state
      } else {
        const result = {
          dataset_id: "bodhi-imgs",
          results: data,
        };
        console.log("data: ", data);
        setRes([result]);
      }
    } catch (error) {
      console.error("Failed to fetch:", error);
    }
  };
  return (
    <div className="grid lg:grid-cols-2 flex-grow">
      <div className="hero min-h-screen bg-base-200 bg-gradient-to-r from-green-500 to-blue-500">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="text-2xl font-bold">🔎🤠 Bodhi AI Explorer</h1>

            <p className="py-6">-- Content Search & Tagger App based on AI </p>
            <div className="join mb-6">
              <div>
                <div>
                  <input
                    style={{ width: "300px" }}
                    className="input input-bordered join-item"
                    value={searchPrompt}
                    onChange={e => {
                      setSearchPrompt(e.target.value);
                    }}
                    onKeyDown={handleEnterPress}
                    placeholder="Enter your prompt to search"
                  />
                </div>
              </div>
              <div>
                <div>
                  {!datasetList ? (
                    <select
                      className="select select-bordered join-item"
                      onChange={e => {
                        setDataset(e.target.value);
                      }}
                    >
                      {options.map((option, index) => (
                        <option key={index} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input input-bordered join-item"
                      value={dataset}
                      onChange={e => {
                        setDataset(e.target.value);
                      }}
                      placeholder="Pls input the public dataset name"
                    />
                  )}
                </div>
              </div>
              <div className="indicator">
                <button
                  className="btn join-item"
                  onClick={() => {
                    handleonClick();
                  }}
                >
                  🔎 Search
                </button>
              </div>
            </div>
            <div className="hero-content text-left">
              <span className="text-sm">
                <p>
                  <b>Some search question examples: </b>
                </p>
                <p>* bitcoin</p>
                <p>* bodhi</p>
                <p>* leeduckgo</p>
              </span>
            </div>
            <a href="https://bodhi.wtf/10586" target="_blank" rel="noreferrer">
              <button className="w-96 bg-white hover:bg-gray-100 text-gray-800 py-2 px-5 border border-gray-400 rounded shadow">
                🤑 <b>Buy</b> shares to support explorer!
              </button>
            </a>
            <br></br>
            <a href="https://bodhi.wtf/13663" target="_blank" rel="noreferrer">
              <button className="w-96 bg-white hover:bg-gray-100 text-gray-800 py-2 px-5 border border-gray-400 rounded shadow">
                📝 Blog for Explorer<b>(See the future plan)</b>
              </button>
            </a>
            <br></br>
            <a href="https://explorer.movespace.xyz" target="_blank" rel="noreferrer">
              <button className="w-96 bg-white hover:bg-gray-100 text-gray-800 py-2 px-5 border border-gray-400 rounded shadow">
                <b>🛝 Go to MoveSpace Explorer</b>
              </button>
            </a>
            <br></br>
            <a href="https://random-hacker.deno.dev/" target="_blank" rel="noreferrer">
              <button className="w-96 bg-white hover:bg-gray-100 text-gray-800 py-2 px-5 border border-gray-400 rounded shadow">
                👽 A Random <b>Indie Hacker</b>
              </button>
            </a>
            <br></br>
            <a href="https://twitter.com/0xleeduckgo" target="_blank" rel="noreferrer">
              <button className="w-96 bg-white hover:bg-gray-100 text-gray-800 py-2 px-5 border border-gray-400 rounded shadow">
                ❤️ Follow my twitter! ❤️
              </button>
            </a>
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-r from-blue-500 to-green-500">
        <div className="mx-auto w-4/5 max-h-[600px] backdrop-blur-lg backdrop-filter p-10 m-10 rounded-lg opacity-80 shadow-md overflow-auto overflow-y-auto">
          <h2 className="text-4xl font-bold mb-1">Search Results</h2>
          <div>
            {res.map((r, index) => (
              <div key={index} className="collapse collapse-open bg-base-200 m-5 overflow-x-auto">
                <input type="checkbox" className="peer" />
                <div className="collapse-title bg-primary text-primary-content peer-checked:bg-secondary peer-checked:text-secondary-content">
                  Results from {r.dataset_id}
                </div>
                {dataset !== "bodhi-imgs" && (
                  <div className="collapse-content bg-primary text-primary-content peer-checked:bg-secondary peer-checked:text-secondary-content">
                    {r.results.map((item, index) => (
                      <div key={index}>
                        <div className="divider"></div>
                        <span className="text-xl">Data</span>
                        <div>
                          <ReactMarkdown>{item.abstract}</ReactMarkdown>
                        </div>
                        <pre className="text-base">
                          <b>Creator:</b> {item.creator}
                        </pre>
                        <pre className="text-base">
                          <b>Bodhi ID(view the full content in Bodhi👉): </b>
                          <a href={"https://bodhi.wtf/" + item.id_on_chain} target="_blank" rel="noreferrer">
                            <button className="btn join-item">{item.id_on_chain}</button>
                          </a>
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
                {dataset === "bodhi-imgs" && (
                  <div className="collapse-content bg-primary text-primary-content peer-checked:bg-secondary peer-checked:text-secondary-content">
                    {r.results.map((item, index) => (
                      <div key={index}>
                        <div className="divider"></div>
                        <div className="text-base">
                          <img src={item.link} alt={item.description} />
                        </div>
                        <span className="text-xl">Category: {item.category}</span>
                        <pre className="text-base">
                          <b>Created At:</b> {new Date(item.created_at).toLocaleString()}
                        </pre>
                        <pre className="text-base">
                          <b>Creator:</b> {item.creator}
                        </pre>
                        <pre className="text-base">
                          <b>Description:</b> {item.description}
                        </pre>
                        <pre className="text-base">
                          <b>ID:</b> {item.id}
                        </pre>
                        <pre className="text-base">
                          <b>Bodhi ID(view the full content in Bodhi👉): </b>
                          <a href={"https://bodhi.wtf/" + item.id_on_chain} target="_blank" rel="noreferrer">
                            <button className="btn join-item">{item.id_on_chain}</button>
                          </a>
                        </pre>

                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ETHSpace;
