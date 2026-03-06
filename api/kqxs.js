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

        // Bốc tách giải thưởng: Chỉ lấy Giải Tám và Giải Đặc Biệt
        stationNames.forEach((name, index) => {
            const lotoList = [];
            const columnIndex = index + 2; // Cột đầu tiên là tên giải, cột 2 trở đi là các đài

            // Lấy Giải Tám (thường nằm ở hàng có class 'giai8' hoặc title 'Giải tám')
            const giaiTamEl = kqxsBox.find('table.rightcl tr.giai8').first();
            if (giaiTamEl.length) {
                let txt8 = giaiTamEl.find(`td:nth-child(${columnIndex})`).text().trim();
                // Tách các số nếu có nhiều số (thường giải 8 chỉ có 1 số)
                const numbers = txt8.split(/[-,\s]+/);
                numbers.forEach(num => {
                    if (num.length >= 2 && !isNaN(num)) {
                        lotoList.push(num.slice(-2)); // Lấy 2 số cuối
                    }
                });
            }

            // Lấy Giải Đặc Biệt (thường nằm ở hàng có class 'giaidb' cx title 'Giải đặc biệt')
            const giaiDbEl = kqxsBox.find('table.rightcl tr.giaidb').first();
            if (giaiDbEl.length) {
                let txtDB = giaiDbEl.find(`td:nth-child(${columnIndex})`).text().trim();
                const numbers = txtDB.split(/[-,\s]+/);
                numbers.forEach(num => {
                    if (num.length >= 2 && !isNaN(num)) {
                        lotoList.push(num.slice(-2)); // Lấy 2 số cuối của giải ĐB
                    }
                });
            }

            resultData.stations.push({
                name: name,
                loto: [...new Set(lotoList)] // Lọc trùng nếu cần
            });
        });

        // Set Headers CORS để client fetch được từ Vercel
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json(resultData);

    } catch (error) {
        console.error("Crawl Error:", error.message);
        res.status(500).json({ error: 'Crawler failed', details: error.message });
    }
}
