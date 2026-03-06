const axios = require('axios');
const cheerio = require('cheerio');

// Bản đồ URL XSKT Miền Nam theo thứ trên Minh Ngọc
const MN_URLS = {
    0: 'xo-so-mien-nam/chu-nhat', // Chủ Nhật
    1: 'xo-so-mien-nam/thu-hai',  // Thứ 2
    2: 'xo-so-mien-nam/thu-ba',   // Thứ 3
    3: 'xo-so-mien-nam/thu-tu',   // Thứ 4
    4: 'xo-so-mien-nam/thu-nam',  // Thứ 5
    5: 'xo-so-mien-nam/thu-sau',  // Thứ 6
    6: 'xo-so-mien-nam/thu-bay',  // Thứ 7
};

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { date } = req.query; // format: DD-MM-YYYY (VD: 05-03-2026)
        let targetUrl = 'https://www.minhngoc.net/';

        if (date) {
            // VD: https://www.minhngoc.net/ket-qua-xo-so/mien-nam/05-03-2026.html
            targetUrl = `https://www.minhngoc.net/ket-qua-xo-so/mien-nam/${date}.html`;
        } else {
            // Lấy ngày hôm nay
            const today = new Date();
            const dayOfWeek = today.getDay(); // 0 (CN) -> 6 (T7)
            targetUrl = `https://www.minhngoc.net/${MN_URLS[dayOfWeek]}.html`;
        }

        console.log("Fetching URL:", targetUrl);

        // Giả lập header trình duyệt để tránh bị chặn
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            },
            timeout: 8000
        });

        const html = response.data;
        const $ = cheerio.load(html);

        // DOM Logic Crawler (Cấu trúc của trang minhngoc)
        // Lưu ý: Cấu trúc này phụ thuộc vào HTML thực tế của trang minhngoc.
        const resultData = {
            date_fetched: date || "Today",
            source: targetUrl,
            stations: []
        };

        // Tìm table bảng kết quả XSMN đầu tiên (box_kqxs)
        const kqxsBox = $('.box_kqxs').first();

        if (!kqxsBox.length) {
            return res.status(404).json({ error: 'Không tìm thấy dữ liệu kết quả trên trang' });
        }

        // Tên các đài
        const stationNames = [];
        kqxsBox.find('table.rightcl tr:first-child td.tinh').each((i, el) => {
            stationNames.push($(el).text().trim());
        });

        // Bốc tách giải thưởng
        // Do cấu trúc web bảng xổ số rất phức tạp (lồng table), code parser cần test thực tế
        // Ở cấp độ API Proxy, ta cào các đuôi lô (2 số cuối) từ phần bảng Loto (nằm dưới bảng giải thưởng thường có)
        // class "bang_loto"
        const bangLoto = kqxsBox.find('.bang_loto').first();

        if (bangLoto.length) {
            stationNames.forEach((name, index) => {
                const lotoList = [];
                // Lấy tất cả các số lô 2 số của cột đài đó
                // Cấu trúc bảng lô thường chia cột TD tương ứng với Đài.
                // Để chính xác tuyệt đối, ta cần phân tích css path, tạm thời mô phỏng trích xuất:
                bangLoto.find(`td:nth-child(${index + 2}) div`).each((i, el) => {
                    let txt = $(el).text().trim();
                    if (txt && /^\d{2}$/.test(txt)) {
                        lotoList.push(txt);
                    }
                });

                // Nếu bảng loto không cấu trúc như vậy, ta lấy 2 số cuối của list trúng thưởng giải
                if (lotoList.length === 0) {
                    kqxsBox.find(`table.rightcl td:nth-child(${index + 2})`).each((i, el) => {
                        let txt = $(el).text().trim();
                        // Tách các giải thường cách nhau khoảng trắng hoặc phẩy (nếu có 2 giải/dòng)
                        const numbers = txt.split(/[-,\s]+/);
                        numbers.forEach(num => {
                            if (num.length >= 2 && !isNaN(num)) {
                                // Lấy 2 số cuối
                                lotoList.push(num.slice(-2));
                            }
                        });
                    });
                }

                resultData.stations.push({
                    name: name,
                    loto: [...new Set(lotoList)] // Lọc trùng nếu cần (thực tế 1 kỳ có thể có lô nháy)
                });
            });
        }

        // Set Headers CORS để client fetch được từ Vercel
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json(resultData);

    } catch (error) {
        console.error("Crawl Error:", error.message);
        res.status(500).json({ error: 'Crawler failed', details: error.message });
    }
}
