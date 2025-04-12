import http from 'http';
import url from 'url';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = 'e06ab430-6ac5-49c0-b27a-f50f4c713c00';
const API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

const server = http.createServer(async (req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理根路径请求，返回index.html
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        try {
            const content = await fs.promises.readFile(path.join(__dirname, 'index.html'));
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
            return;
        } catch (error) {
            console.error('Error reading index.html:', error);
            res.writeHead(500);
            res.end('Internal Server Error');
            return;
        }
    }

    // 处理预检请求
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 只处理/generate-names的POST请求
    if (req.method === 'POST' && req.url === '/generate-names') {
        let body = '';
        req.on('data', chunk => body += chunk);

        req.on('end', async () => {
            try {
                const { englishName } = JSON.parse(body);
                
                // 构建API请求
                const apiRequestBody = {
                    model: 'ep-20250329175740-sqphz',
                    messages: [
                        {
                            role: 'system',
                            content: '你是一个专门为外国人起中文名的AI助手。你需要根据用户的英文名，生成三个有趣且富有文化内涵的中文名。每个名字都应该体现中国文化特色，并带有一些幽默或有趣的元素。'
                        },
                        {
                            role: 'user',
                            content: `请为英文名"${englishName}"生成三个中文名。每个名字都需要提供：1. 中文名字 2. 中文寓意解释 3. 英文解释。请用JSON格式返回，格式为：{"names":[{"chinese":"中文名","chineseMeaning":"中文寓意","englishMeaning":"英文解释"}]}`
                        }
                    ]
                };

                // 调用火山引擎API
                console.log('Sending request to API with body:', JSON.stringify(apiRequestBody));
                const apiResponse = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${API_KEY}`
                    },
                    body: JSON.stringify(apiRequestBody)
                });

                if (!apiResponse.ok) {
                    const errorText = await apiResponse.text();
                    console.error('API response not ok:', {
                        status: apiResponse.status,
                        statusText: apiResponse.statusText,
                        responseBody: errorText
                    });
                    throw new Error(`API request failed: ${apiResponse.status} ${apiResponse.statusText}`);
                }

                const responseText = await apiResponse.text();
                console.log('Raw API Response:', responseText);
                
                let apiData;
                try {
                    apiData = JSON.parse(responseText);
                    console.log('Parsed API Response:', apiData);
                } catch (parseError) {
                    console.error('Failed to parse API response:', parseError);
                    throw new Error(`Invalid JSON response from API: ${responseText}`);
                }
                
                if (!apiData.choices || !apiData.choices[0] || !apiData.choices[0].message || !apiData.choices[0].message.content) {
                    console.error('Invalid API response structure:', apiData);
                    throw new Error('Invalid API response format: missing required fields');
                }
                
                const content = apiData.choices[0].message.content;
                console.log('Content from API:', content);
                
                try {
                    // 预处理API返回的内容，移除可能的前后缀
                    let cleanContent = content.trim();
                    if (cleanContent.startsWith('```json')) {
                        cleanContent = cleanContent.substring(7);
                    }
                    if (cleanContent.endsWith('```')) {
                        cleanContent = cleanContent.substring(0, cleanContent.length - 3);
                    }
                    cleanContent = cleanContent.trim();
                    
                    console.log('Cleaned content for parsing:', cleanContent);
                    
                    // 尝试解析清理后的内容
                    let generatedNames = JSON.parse(cleanContent);
                    
                    // 验证并规范化响应格式
                    if (!generatedNames || typeof generatedNames !== 'object') {
                        throw new Error('Invalid response format: not a valid JSON object');
                    }
                    
                    if (!generatedNames.names) {
                        // 如果返回的是数组格式，转换为预期的对象格式
                        if (Array.isArray(generatedNames)) {
                            generatedNames = { names: generatedNames };
                        } else {
                            throw new Error('Invalid response format: missing names array');
                        }
                    }
                    
                    if (!Array.isArray(generatedNames.names)) {
                        throw new Error('Invalid response format: names is not an array');
                    }
                    
                    // 验证每个名字对象的格式
                    generatedNames.names.forEach((name, index) => {
                        if (!name.chinese || !name.chineseMeaning || !name.englishMeaning) {
                            throw new Error(`Invalid name object at index ${index}: missing required fields`);
                        }
                    });
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(generatedNames));
                } catch (parseError) {
                    console.error('Parse error:', parseError);
                    console.error('Raw content:', content);
                    throw new Error(`Failed to parse generated names: ${parseError.message}`);
                }

            } catch (error) {
                console.error('Error details:', {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    error: 'Internal server error', 
                    details: error.message 
                }));
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});