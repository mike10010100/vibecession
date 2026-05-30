import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea, ReferenceLine
} from 'recharts';
import { 
  TrendingDown, ShieldAlert, BadgePercent, Landmark, CreditCard, PiggyBank, BarChart3, Info, Sun, Moon, Calendar, Sliders, ChevronDown, ChevronUp, BookOpen, AlertCircle
} from 'lucide-react';

// OLS Solver
function transpose(A) { return A[0].map((_, colIdx) => A.map(row => row[colIdx])); }
function multiply(A, B) {
  const numRowsA = A.length, numColsA = A[0].length, numColsB = B[0].length;
  const result = Array(numRowsA).fill(0).map(() => Array(numColsB).fill(0));
  for (let r = 0; r < numRowsA; r++) {
    for (let c = 0; c < numColsB; c++) {
      for (let i = 0; i < numColsA; i++) result[r][c] += A[r][i] * B[i][c];
    }
  }
  return result;
}
function invertMatrix(M) {
  const n = M.length;
  const A = M.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);
  for (let i = 0; i < n; i++) {
    let pivotRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(A[pivotRow][i])) pivotRow = r;
    }
    [A[i], A[pivotRow]] = [A[pivotRow], A[i]];
    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-10) return null;
    for (let j = 0; j < 2 * n; j++) A[i][j] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = A[r][i];
      for (let j = 0; j < 2 * n; j++) A[r][j] -= factor * A[i][j];
    }
  }
  return A.map(row => row.slice(n));
}
function solveOLS(y, X) {
  try {
    const XT = transpose(X);
    const XTX = multiply(XT, X);
    const XTX_inv = invertMatrix(XTX);
    if (!XTX_inv) return null;
    return multiply(XTX_inv, multiply(XT, y.map(v => [v]))).map(v => v[0]);
  } catch (e) {
    return null;
  }
}

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');
  
  // Navigation: Story Chapters
  const [activeChapter, setActiveChapter] = useState('chapter-1');
  const [sandboxOpen, setSandboxOpen] = useState(false);
  
  // Parameters (Tucked inside the Sandbox drawer)
  const [baseMonth, setBaseMonth] = useState('2020-01-31');
  const [lossAversionCoef, setLossAversionCoef] = useState(2.0);
  const [trainStart, setTrainStart] = useState('1990-01-31');
  const [trainEnd, setTrainEnd] = useState('2019-12-31');
  
  const [regressionVars, setRegressionVars] = useState({
    Unemployment_Rate: true,
    CPI_YoY: true,
    Decayed_CPI_Shock_2020: false,
    Cumulative_CPI_Increase_2020: false,
    Personal_Savings_Rate: false,
    Mortgage_30Y: false,
    Fed_Funds_Rate: false,
    Real_Wage_Index_YoY: false,
    Case_Shiller_Index: false,
    Real_Retail_Sales: false,
    Gas_Prices: false,
    Policy_Uncertainty: false
  });

  const [visibleStickerLines, setVisibleStickerLines] = useState({
    Wages: true,
    CPI: true,
    Food: true,
    Rent: false,
    Housing: true,
    LossAversion: true
  });

  // Fetch economic JSON
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}dataset/economic_data.json`)
      .then(res => res.json())
      .then(json => {
        const cleaned = json.map(row => {
          const newRow = { ...row };
          Object.keys(newRow).forEach(k => {
            if (k !== 'Date' && newRow[k] !== null) newRow[k] = parseFloat(newRow[k]);
          });
          return newRow;
        });
        setData(cleaned);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading economic datasets", err);
        setLoading(false);
      });
  }, []);

  // Sync theme
  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  // Dropdown list computation
  const availableMonths = useMemo(() => {
    return data.filter(row => row.Date >= '2018-01-31').map(row => row.Date).sort();
  }, [data]);
  const trainStartMonths = useMemo(() => {
    return data.filter(row => row.Date >= '1980-01-31' && row.Date <= '2015-12-31').map(row => row.Date).sort();
  }, [data]);
  const trainEndMonths = useMemo(() => {
    return data.filter(row => row.Date >= '2000-01-31' && row.Date <= '2022-12-31').map(row => row.Date).sort();
  }, [data]);

  // OLS Regression Solver
  const regressionResults = useMemo(() => {
    if (data.length === 0) return { coefficients: null, predictedData: [] };
    const trainSet = data.filter(row => {
      const isTrain = row.Date >= trainStart && row.Date <= trainEnd;
      if (!isTrain || row.Consumer_Sentiment === null) return false;
      let hasNull = false;
      Object.keys(regressionVars).forEach(v => {
        if (regressionVars[v] && row[v] === null) hasNull = true;
      });
      return !hasNull;
    });

    if (trainSet.length < 10) return { coefficients: null, error: "Select a wider training range.", predictedData: [] };

    const y = trainSet.map(row => row.Consumer_Sentiment);
    const selectedKeys = Object.keys(regressionVars).filter(k => regressionVars[k]);
    const X = trainSet.map(row => {
      const rowX = [1];
      selectedKeys.forEach(k => rowX.push(row[k]));
      return rowX;
    });

    const beta = solveOLS(y, X);
    if (!beta) return { coefficients: null, error: "Singular matrix. Try modifying inputs.", predictedData: [] };

    const coefficients = { Intercept: beta[0] };
    selectedKeys.forEach((k, idx) => { coefficients[k] = beta[idx + 1]; });

    const predictedData = data.map(row => {
      let pred = beta[0];
      let canPredict = true;
      selectedKeys.forEach((k, idx) => {
        if (row[k] === null) canPredict = false;
        else pred += beta[idx + 1] * row[k];
      });
      return {
        ...row,
        Predicted_Sentiment: canPredict ? Math.max(0, Math.min(150, pred)) : null,
        Vibe_Gap: (canPredict && row.Consumer_Sentiment !== null) ? row.Consumer_Sentiment - pred : null
      };
    });

    const yMean = y.reduce((a, b) => a + b, 0) / y.length;
    const ssTot = y.reduce((acc, val) => acc + Math.pow(val - yMean, 2), 0);
    let ssRes = 0;
    trainSet.forEach((row, idx) => {
      let pred = beta[0];
      selectedKeys.forEach((k, vIdx) => { pred += beta[vIdx + 1] * row[k]; });
      ssRes += Math.pow(y[idx] - pred, 2);
    });

    coefficients['R_Squared'] = 1 - (ssRes / ssTot);
    return { coefficients, predictedData };
  }, [data, trainStart, trainEnd, regressionVars]);

  // Derived Cumulative Metrics
  const cumulativeData = useMemo(() => {
    if (data.length === 0) return [];
    const baseRow = data.find(row => row.Date === baseMonth);
    if (!baseRow) return [];

    const baseCpi = baseRow.CPI_All_Items;
    const baseFood = baseRow.CPI_Food;
    const baseRent = baseRow.CPI_Rent;
    const baseWages = baseRow.Average_Hourly_Earnings;
    const baseHpi = baseRow.Case_Shiller_Index;

    return data
      .filter(row => row.Date >= baseMonth)
      .map(row => {
        const cpiCumul = ((row.CPI_All_Items / baseCpi) - 1) * 100;
        const foodCumul = ((row.CPI_Food / baseFood) - 1) * 100;
        const rentCumul = ((row.CPI_Rent / baseRent) - 1) * 100;
        const wageCumul = ((row.Average_Hourly_Earnings / baseWages) - 1) * 100;
        const hpiCumul = baseHpi && row.Case_Shiller_Index ? (((row.Case_Shiller_Index / baseHpi) - 1) * 100) : null;
        const lossAversionIdx = 100 + wageCumul - (lossAversionCoef * cpiCumul);

        return {
          Date: row.Date,
          Consumer_Sentiment: row.Consumer_Sentiment,
          Cumulative_CPI: cpiCumul,
          Cumulative_Food: foodCumul,
          Cumulative_Rent: rentCumul,
          Cumulative_Wages: wageCumul,
          Cumulative_Housing: hpiCumul,
          Loss_Aversion_Index: lossAversionIdx
        };
      });
  }, [data, baseMonth, lossAversionCoef]);

  // Aligned Crisis Sentiment Overlay Data
  const historicalOverlayData = useMemo(() => {
    if (data.length === 0) return [];
    const getCycle = (startDate, name) => {
      const idx = data.findIndex(row => row.Date === startDate);
      if (idx === -1) return [];
      return data.slice(idx, idx + 72).map((row, i) => ({ Month: i, [name]: row.Consumer_Sentiment }));
    };
    const c1978 = getCycle('1978-05-31', 'S1978');
    const c2007 = getCycle('2007-01-31', 'S2007');
    const c2020 = getCycle('2020-01-31', 'S2020');

    const merged = [];
    for (let m = 0; m < 72; m++) {
      const item = { Month: m };
      if (c1978[m]) item['1978 Stagflation Crisis'] = c1978[m].S1978;
      if (c2007[m]) item['2007 Great Recession'] = c2007[m].S2007;
      if (c2020[m]) item['2020 Vibecession (Current)'] = c2020[m].S2020;
      if (c1978[m] || c2007[m] || c2020[m]) merged.push(item);
    }
    return merged;
  }, [data]);

  // Aligned "Do-Say" Disconnect data for Chapter 5
  const disconnectData = useMemo(() => {
    if (data.length === 0) return [];
    const baseRow = data.find(row => row.Date === '2020-01-31');
    if (!baseRow) return [];
    const baseSentiment = baseRow.Consumer_Sentiment || 99.8;
    const baseSales = baseRow.Real_Retail_Sales || 198790.0;

    return data
      .filter(row => row.Date >= '2020-01-31')
      .map(row => ({
        Date: row.Date,
        Normalized_Sentiment: row.Consumer_Sentiment ? (row.Consumer_Sentiment / baseSentiment) * 100 : null,
        Normalized_Retail_Sales: row.Real_Retail_Sales ? (row.Real_Retail_Sales / baseSales) * 100 : null,
        Policy_Uncertainty: row.Policy_Uncertainty
      }));
  }, [data]);

  // Compute stats for metrics bar
  const latestMetrics = useMemo(() => {
    if (data.length === 0) return {};
    const valid = data.filter(row => row.Consumer_Sentiment !== null);
    const latest = valid[valid.length - 1];
    const predRow = regressionResults.predictedData.find(row => row.Date === latest.Date);
    const baseRow = data.find(row => row.Date === baseMonth) || latest;

    return {
      Date: latest.Date,
      Sentiment: latest.Consumer_Sentiment,
      Sentiment_Prev: valid[valid.length - 2]?.Consumer_Sentiment || 0,
      Unemployment: latest.Unemployment_Rate,
      CPI_YoY: latest.CPI_YoY,
      Mortgage_30Y: latest.Mortgage_30Y,
      Delinquency_Rate: latest.Credit_Card_Delinquency_Rate,
      Savings_Rate: latest.Personal_Savings_Rate,
      Vibe_Gap: predRow?.Vibe_Gap || 0,
      Cumulative_CPI: (((latest.CPI_All_Items / baseRow.CPI_All_Items) - 1) * 100),
      Cumulative_Wages: (((latest.Average_Hourly_Earnings / baseRow.Average_Hourly_Earnings) - 1) * 100),
      Loss_Aversion_Index: 100 + (((latest.Average_Hourly_Earnings / baseRow.Average_Hourly_Earnings) - 1) * 100) - (lossAversionCoef * (((latest.CPI_All_Items / baseRow.CPI_All_Items) - 1) * 100))
    };
  }, [data, regressionResults, baseMonth, lossAversionCoef]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 600 }}>Analyzing Macroeconomic Frameworks...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Editorial Header */}
      <header className="dashboard-header" style={{ border: 'none', paddingBottom: '0' }}>
        <div className="brand-section" style={{ maxWidth: '800px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
            <BookOpen size={16} /> <span>An Economic Storyboard</span>
          </div>
          <h1>The Vibecession Paradox</h1>
          <p style={{ fontSize: '1.15rem', color: 'var(--text-main)', marginTop: '0.5rem', lineHeight: '1.5' }}>
            Why U.S. consumer sentiment collapsed to historical recessional lows during an era of record-low unemployment and strong GDP growth. Explore the data-driven chapters below.
          </p>
        </div>
        <div className="controls-section" style={{ marginLeft: 'auto' }}>
          <button 
            className="btn-toggle" 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            style={{ borderRadius: '50px', padding: '0.6rem 1.2rem' }}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>
          </button>
        </div>
      </header>

      {/* Chapters Navigation Tabs */}
      <nav className="tab-navigation" style={{ background: 'var(--bg-card)', padding: '0.4rem', borderRadius: '50px', border: '1px solid var(--border-color)', alignSelf: 'flex-start', margin: '1rem 0', display: 'flex', flexWrap: 'wrap', gap: '0.2rem' }}>
        <button 
          className={`tab-btn ${activeChapter === 'chapter-1' ? 'active' : ''}`}
          onClick={() => { setActiveChapter('chapter-1'); setSandboxOpen(false); }}
          style={{ borderRadius: '50px', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
        >
          1. The Vibe Gap
        </button>
        <button 
          className={`tab-btn ${activeChapter === 'chapter-2' ? 'active' : ''}`}
          onClick={() => { setActiveChapter('chapter-2'); setSandboxOpen(false); }}
          style={{ borderRadius: '50px', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
        >
          2. Sticker Shock
        </button>
        <button 
          className={`tab-btn ${activeChapter === 'chapter-3' ? 'active' : ''}`}
          onClick={() => { setActiveChapter('chapter-3'); setSandboxOpen(false); }}
          style={{ borderRadius: '50px', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
        >
          3. Credit & Capital
        </button>
        <button 
          className={`tab-btn ${activeChapter === 'chapter-4' ? 'active' : ''}`}
          onClick={() => { setActiveChapter('chapter-4'); setSandboxOpen(false); }}
          style={{ borderRadius: '50px', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
        >
          4. Historical Overlay
        </button>
        <button 
          className={`tab-btn ${activeChapter === 'chapter-5' ? 'active' : ''}`}
          onClick={() => { setActiveChapter('chapter-5'); setSandboxOpen(false); }}
          style={{ borderRadius: '50px', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
        >
          5. Peer Critique
        </button>
      </nav>

      {/* Structured Split Layout */}
      <main className="dashboard-grid" style={{ gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
        
        {/* LEFT COLUMN: Narrative Card & Interactive Drawer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Chapter Narrative Card */}
          <div className="theory-card" style={{ height: 'auto', borderLeft: '4px solid var(--primary)', paddingLeft: '1.5rem' }}>
            {activeChapter === 'chapter-1' && (
              <>
                <h3 style={{ fontSize: '1.5rem', color: 'var(--text-bright)' }}>Chapter 1: The Disconnect</h3>
                <div className="theory-content" style={{ gap: '1rem', marginTop: '0.5rem' }}>
                  <p>
                    Historically, U.S. consumer sentiment was highly predictable. A model trained on thirty years of data (**1990-2019**) using just <strong>Unemployment</strong> and <strong>Annual Inflation Rate</strong> explained 60% of the public mood.
                  </p>
                  <p>
                    Post-pandemic, this historical model broke down entirely. Based on a 3.6% unemployment rate and inflation returning to target, sentiment should have hovered near **90.0**. Instead, it crashed to **50.0** in June 2022.
                  </p>
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem', display: 'flex', gap: '2rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Average Vibe Gap</span>
                      <strong style={{ fontSize: '1.75rem', color: 'var(--danger)' }}>{latestMetrics.Vibe_Gap?.toFixed(1)} pts</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Unemployment Rate</span>
                      <strong style={{ fontSize: '1.75rem', color: 'var(--success)' }}>{latestMetrics.Unemployment?.toFixed(1)}%</strong>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeChapter === 'chapter-2' && (
              <>
                <h3 style={{ fontSize: '1.5rem', color: 'var(--text-bright)' }}>Chapter 2: Sticker Shock & Loss Aversion</h3>
                <div className="theory-content" style={{ gap: '1rem', marginTop: '0.5rem' }}>
                  <p>
                    Why did sentiment stay depressed if wages outpaced inflation? The answer lies in <strong>sticker shock</strong> and <strong>loss aversion</strong>.
                  </p>
                  <p>
                    Wages rose 34.8% since 2020, but inelastic necessities rose faster: food is up **33.5%**, rent is up **31.8%**, and home prices rose **45.0%**. According to behavioral economics, we feel losses twice as intensely as gains. When price shocks are weighted at 2.0x, the **Loss Aversion Index** drops below 100, leaving consumers feeling poorer.
                  </p>
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem', display: 'flex', gap: '2rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Loss Aversion Index</span>
                      <strong style={{ fontSize: '1.75rem', color: latestMetrics.Loss_Aversion_Index < 100 ? 'var(--danger)' : 'var(--success)' }}>
                        {latestMetrics.Loss_Aversion_Index?.toFixed(1)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Cumulative Cost Hike</span>
                      <strong style={{ fontSize: '1.75rem', color: 'var(--primary)' }}>+{latestMetrics.Cumulative_CPI?.toFixed(1)}%</strong>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeChapter === 'chapter-3' && (
              <>
                <h3 style={{ fontSize: '1.5rem', color: 'var(--text-bright)' }}>Chapter 3: The Credit & Housing Lock-out</h3>
                <div className="theory-content" style={{ gap: '1rem', marginTop: '0.5rem' }}>
                  <p>
                    The secondary shock was a cash-flow drain. In 2021-2022, households depleted their liquid cash reserves to maintain spending, pushing the savings rate from 25% down to **under 4%**.
                  </p>
                  <p>
                    To cover the gap, consumers took on record credit card debt. Because the Fed hiked rates to over 5%, borrowing costs exploded. Mortgage rates rising to 7.6% doubled the monthly payment of purchasing a home, locking out prospective buyers and freezing housing supply.
                  </p>
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem', display: 'flex', gap: '2rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Savings Rate</span>
                      <strong style={{ fontSize: '1.75rem', color: 'var(--danger)' }}>{latestMetrics.Savings_Rate?.toFixed(1)}%</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>30Y Mortgage Rate</span>
                      <strong style={{ fontSize: '1.75rem', color: 'var(--warning)' }}>{latestMetrics.Mortgage_30Y?.toFixed(2)}%</strong>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeChapter === 'chapter-4' && (
              <>
                <h3 style={{ fontSize: '1.5rem', color: 'var(--text-bright)' }}>Chapter 4: The Aligned Crisis Overlay</h3>
                <div className="theory-content" style={{ gap: '1rem', marginTop: '0.5rem' }}>
                  <p>
                    Aligning sentiment peaks (Month 0) for the major economic shocks of the last 50 years reveals the unique persistence of the post-pandemic cycle.
                  </p>
                  <p>
                    In 1978 and 2007, consumer sentiment began recovering 18-24 months after the initial shock. The **2020 Vibecession**, however, remains pinned near all-time lows. Because prices stabilized at elevated baselines without falling (no deflation), the cost-of-living squeeze was never relieved.
                  </p>
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem', display: 'flex', gap: '2rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Current Sentiment</span>
                      <strong style={{ fontSize: '1.75rem', color: 'var(--primary)' }}>{latestMetrics.Sentiment?.toFixed(1)}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Min Sentiment (June 2022)</span>
                      <strong style={{ fontSize: '1.75rem', color: 'var(--danger)' }}>50.0</strong>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeChapter === 'chapter-5' && (
              <>
                <h3 style={{ fontSize: '1.5rem', color: 'var(--text-bright)' }}>Chapter 5: Peer-Review Critique</h3>
                <div className="theory-content" style={{ gap: '0.8rem', marginTop: '0.5rem', maxHeight: '350px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                  <p>
                    A rigorous review of the Unified Theory by our <strong>Macroeconomic Peer-Reviewer</strong> reveals several counter-arguments, behavioral caveats, and econometric corrections:
                  </p>
                  <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '0.5rem 0', listStyleType: 'disc' }}>
                    <li>
                      <strong>The Partisan Noise (~30%):</strong> Traditional sentiment indexes are heavily contaminated by "expressive responding". Research shows Republicans and Democrats use surveys to signal political disapproval. Using the sentiment of <em>Independent voters</em> removes this bias.
                    </li>
                    <li>
                      <strong>The "Do-Say" Disconnect:</strong> While consumers tell survey-takers that sentiment is at recessionary lows, actual spending (PCE) remains at record highs. A 50-year low in unemployment (3.6%) has collapsed the <em>precautionary savings motive</em>, allowing consumers to comfortably spend down savings and take on credit card debt.
                    </li>
                    <li>
                      <strong>The OECD/International Anomaly:</strong> European confidence fell due to real energy shocks and falling real wages, matching actual retail contraction. The U.S., however, has had G7-leading growth and positive real wages, yet sentiment fell to the same stagflationary depths, showing a U.S.-specific psychological anomaly.
                    </li>
                    <li>
                      <strong>Econometric Violations:</strong> The standard OLS model violates linear assumptions due to <em>multicollinearity</em> (VIF &gt; 10) and <em>serial correlation</em> (Durbin-Watson = 0.651). Correcting with <strong>Newey-West standard errors</strong> renders the Federal Funds Rate statistically insignificant.
                    </li>
                  </ul>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                    For a full breakdown of the critique, see the report: <a href="https://github.com/mike10010100/vibecession/blob/main/vibecession_critique.md" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>vibecession_critique.md</a>.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* COLLAPSIBLE SANDBOX CONTROLS PANEL */}
          {activeChapter !== 'chapter-4' && activeChapter !== 'chapter-5' && (
            <div className="chart-card" style={{ padding: '1rem 1.5rem', gap: '0' }}>
              <button 
                className="btn-toggle" 
                onClick={() => setSandboxOpen(!sandboxOpen)}
                style={{ width: '100%', background: 'transparent', border: 'none', display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--text-bright)' }}>
                  <Sliders size={18} />
                  <span>Advanced Analysis Sandbox</span>
                </div>
                {sandboxOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {sandboxOpen && (
                <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
                  
                  {/* Chapter 1 controls */}
                  {activeChapter === 'chapter-1' && (
                    <>
                      <div className="selector-group">
                        <label>OLS Regression Inputs</label>
                        <div style={{ display: 'flex', gap: '0.75rem 1.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                          {Object.keys(regressionVars).map(k => (
                            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', color: 'var(--text-bright)' }}>
                              <input 
                                type="checkbox" 
                                checked={regressionVars[k]}
                                onChange={(e) => setRegressionVars({ ...regressionVars, [k]: e.target.checked })}
                                style={{ accentColor: 'var(--primary)' }}
                              />
                              <span>{k.replace(/_/g, ' ')}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <div className="selector-group">
                          <label>Training Start</label>
                          <select className="custom-select" value={trainStart} onChange={(e) => setTrainStart(e.target.value)}>
                            {trainStartMonths.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        <div className="selector-group">
                          <label>Training End</label>
                          <select className="custom-select" value={trainEnd} onChange={(e) => setTrainEnd(e.target.value)}>
                            {trainEndMonths.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                      </div>

                      {regressionResults.coefficients && (
                        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-app)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-bright)' }}>Model Coefficients (OLS):</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', color: 'var(--text-main)' }}>
                            <div>R²: {(regressionResults.coefficients.R_Squared * 100).toFixed(1)}%</div>
                            <div>Intercept: {regressionResults.coefficients.Intercept.toFixed(2)}</div>
                            {Object.keys(regressionResults.coefficients).map(k => {
                              if (k === 'Intercept' || k === 'R_Squared') return null;
                              return <div key={k}>{k.replace(/_/g, ' ')}: {regressionResults.coefficients[k] >= 0 ? '+' : ''}{regressionResults.coefficients[k].toFixed(4)}</div>;
                            })}
                          </div>
                          {regressionVars.Cumulative_CPI_Increase_2020 && regressionVars.Fed_Funds_Rate && (
                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--danger-glow)', border: '1px solid rgba(244, 63, 94, 0.2)', color: 'var(--danger)', borderRadius: '6px', fontSize: '0.75rem', display: 'flex', gap: '0.4rem' }}>
                              <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '0.05rem' }} />
                              <span><strong>Warning:</strong> High Multicollinearity (VIF &gt; 10) detected between Cumulative CPI and Fed Funds Rate. Standard errors are inflated, making coefficients unstable.</span>
                            </div>
                          )}
                          <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--primary-glow)', border: '1px solid rgba(99, 102, 241, 0.2)', color: 'var(--text-bright)', borderRadius: '6px', fontSize: '0.75rem', display: 'flex', gap: '0.4rem' }}>
                            <Info size={16} style={{ flexShrink: 0, marginTop: '0.05rem', color: 'var(--primary)' }} />
                            <span><strong>💡 Econ Tip:</strong> Select <em>Unemployment Rate</em>, <em>Decayed CPI Shock 2020</em>, <em>Personal Savings Rate</em>, and <em>Mortgage 30Y</em> for the optimal model (R² ~59.4%) with signs matching economic theory!</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Chapter 2 controls */}
                  {activeChapter === 'chapter-2' && (
                    <>
                      <div className="selector-group">
                        <label>Base Month</label>
                        <select className="custom-select" value={baseMonth} onChange={(e) => setBaseMonth(e.target.value)}>
                          {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className="selector-group">
                        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Loss Aversion Multiplier: <strong>{lossAversionCoef.toFixed(1)}x</strong></span>
                        </label>
                        <input 
                          type="range" 
                          min="1.0" 
                          max="3.0" 
                          step="0.1" 
                          value={lossAversionCoef} 
                          onChange={(e) => setLossAversionCoef(parseFloat(e.target.value))}
                          style={{ accentColor: 'var(--primary)', height: '6px', borderRadius: '3px', outline: 'none', margin: '0.5rem 0' }}
                        />
                      </div>
                      <div className="selector-group">
                        <label>Visible Series</label>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                          {Object.keys(visibleStickerLines).map(k => (
                            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', color: 'var(--text-bright)' }}>
                              <input 
                                type="checkbox" 
                                checked={visibleStickerLines[k]} 
                                onChange={(e) => setVisibleStickerLines({ ...visibleStickerLines, [k]: e.target.checked })}
                                style={{ accentColor: 'var(--primary)' }}
                              />
                              <span>{k === 'LossAversion' ? 'Loss Aversion Index' : k === 'Housing' ? 'Case-Shiller Home Prices' : k}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Chapter 3 Info */}
                  {activeChapter === 'chapter-3' && (
                    <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--text-muted)' }}>
                      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                      <p>
                        This view plots monthly percentages. Use this data to observe the cash-flow transition from savings depletion to debt buildup as credit card delinquencies peaked.
                      </p>
                    </div>
                  )}

                </div>
              )}
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: Uncluttered Clean Charts */}
        <div className="chart-card" style={{ padding: '1.5rem', justifyContent: 'center' }}>
          
          {/* Chart 1: The Disconnect */}
          {activeChapter === 'chapter-1' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '1.1rem', color: 'var(--text-bright)' }}>Actual vs. Predicted Sentiment</h4>
                <span className="chart-subtitle">Shaded area represents the "Vibe Gap" deflection (2020-2026)</span>
              </div>
              <div className="chart-wrapper" style={{ height: '380px' }}>
                {regressionResults.error ? (
                  <div className="alert-box"><p>{regressionResults.error}</p></div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={regressionResults.predictedData.filter(row => row.Date >= '2010-01-31')}
                      margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#222736' : '#e2e8f0'} />
                      <XAxis dataKey="Date" stroke="var(--text-muted)" fontSize={10} />
                      <YAxis domain={[40, 110]} stroke="var(--text-muted)" fontSize={10} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '0.85rem', marginTop: '10px' }} />
                      <Line name="Actual Sentiment" type="monotone" dataKey="Consumer_Sentiment" stroke="var(--primary)" strokeWidth={3} dot={false} />
                      <Line name="Baseline Prediction" type="monotone" dataKey="Predicted_Sentiment" stroke="var(--secondary)" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                      <ReferenceArea x1="2020-01-31" x2={latestMetrics.Date} fill="rgba(244, 63, 94, 0.04)" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </>
          )}

          {/* Chart 2: Sticker Shock */}
          {activeChapter === 'chapter-2' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '1.1rem', color: 'var(--text-bright)' }}>Cumulative Price Shock vs. Wages</h4>
                <span className="chart-subtitle">Calculated relative to base month: {baseMonth}</span>
              </div>
              <div className="chart-wrapper" style={{ height: '380px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumulativeData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#222736' : '#e2e8f0'} />
                    <XAxis dataKey="Date" stroke="var(--text-muted)" fontSize={10} />
                    <YAxis stroke="var(--text-muted)" fontSize={10} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '0.85rem', marginTop: '10px' }} />
                    {visibleStickerLines.Wages && <Line name="Wages (%)" type="monotone" dataKey="Cumulative_Wages" stroke="var(--success)" strokeWidth={2} dot={false} />}
                    {visibleStickerLines.CPI && <Line name="CPI Inflation (%)" type="monotone" dataKey="Cumulative_CPI" stroke="var(--primary)" strokeWidth={2} dot={false} />}
                    {visibleStickerLines.Food && <Line name="Food Prices (%)" type="monotone" dataKey="Cumulative_Food" stroke="var(--danger)" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />}
                    {visibleStickerLines.Rent && <Line name="Rent (%)" type="monotone" dataKey="Cumulative_Rent" stroke="var(--secondary)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />}
                    {visibleStickerLines.Housing && <Line name="Case-Shiller Home Prices (%)" type="monotone" dataKey="Cumulative_Housing" stroke="var(--warning)" strokeWidth={2} dot={false} />}
                    {visibleStickerLines.LossAversion && <Line name="Loss Aversion Index" type="monotone" dataKey="Loss_Aversion_Index" stroke="#eab308" strokeWidth={2.5} strokeDasharray="6 3" dot={false} />}
                    <ReferenceLine y={100} stroke="var(--text-muted)" strokeDasharray="3 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* Chart 3: Credit Squeeze */}
          {activeChapter === 'chapter-3' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '1.1rem', color: 'var(--text-bright)' }}>Household Cash Flow Indicators</h4>
                <span className="chart-subtitle">Delinquencies and rates since 2015</span>
              </div>
              <div className="chart-wrapper" style={{ height: '380px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.filter(row => row.Date >= '2015-01-31')} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#222736' : '#e2e8f0'} />
                    <XAxis dataKey="Date" stroke="var(--text-muted)" fontSize={10} />
                    <YAxis yAxisId="percent" stroke="var(--text-muted)" fontSize={10} />
                    <YAxis yAxisId="distress" orientation="right" stroke="var(--text-muted)" fontSize={10} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '0.85rem', marginTop: '10px' }} />
                    <Line yAxisId="percent" name="Savings Rate (%)" type="monotone" dataKey="Personal_Savings_Rate" stroke="var(--success)" strokeWidth={2} dot={false} />
                    <Line yAxisId="percent" name="30Y Mortgage (%)" type="monotone" dataKey="Mortgage_30Y" stroke="var(--warning)" strokeWidth={2} dot={false} />
                    <Line yAxisId="distress" name="Card Delinquency (%)" type="monotone" dataKey="Credit_Card_Delinquency_Rate" stroke="var(--danger)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* Chart 4: Historical Overlay */}
          {activeChapter === 'chapter-4' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '1.1rem', color: 'var(--text-bright)' }}>Aligned Sentiment Trajectories</h4>
                <span className="chart-subtitle">X-Axis aligned by Month 0 (sentiment peak prior to cycle trough)</span>
              </div>
              <div className="chart-wrapper" style={{ height: '380px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historicalOverlayData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#222736' : '#e2e8f0'} />
                    <XAxis dataKey="Month" stroke="var(--text-muted)" fontSize={10} />
                    <YAxis domain={[40, 110]} stroke="var(--text-muted)" fontSize={10} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '0.85rem', marginTop: '10px' }} />
                    <Line name="1978 Stagflation" type="monotone" dataKey="1978 Stagflation Crisis" stroke="var(--danger)" strokeWidth={1.5} dot={false} />
                    <Line name="2007 Great Recession" type="monotone" dataKey="2007 Great Recession" stroke="var(--primary)" strokeWidth={1.5} dot={false} />
                    <Line name="2020 Vibecession (Current)" type="monotone" dataKey="2020 Vibecession (Current)" stroke="var(--secondary)" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* Chart 5: Peer Critique (The Do-Say Disconnect) */}
          {activeChapter === 'chapter-5' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '1.1rem', color: 'var(--text-bright)' }}>The "Do-Say" Disconnect (Index: Jan 2020 = 100)</h4>
                <span className="chart-subtitle">Sentiment collapsed by half, while inflation-adjusted retail sales expanded by ~15%</span>
              </div>
              <div className="chart-wrapper" style={{ height: '380px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={disconnectData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#222736' : '#e2e8f0'} />
                    <XAxis dataKey="Date" stroke="var(--text-muted)" fontSize={10} />
                    <YAxis stroke="var(--text-muted)" fontSize={10} domain={[40, 130]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '0.85rem', marginTop: '10px' }} />
                    <Line name="Sentiment Index" type="monotone" dataKey="Normalized_Sentiment" stroke="var(--primary)" strokeWidth={3} dot={false} />
                    <Line name="Real Retail Sales Index" type="monotone" dataKey="Normalized_Retail_Sales" stroke="var(--success)" strokeWidth={3} dot={false} />
                    <ReferenceLine y={100} stroke="var(--text-muted)" strokeDasharray="3 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

        </div>

      </main>

      {/* Structured Editorial Footer */}
      <footer className="dashboard-footer" style={{ marginTop: '3rem' }}>
        <p>Data Pipeline Sources: Federal Reserve Bank of St. Louis (FRED) • Bureau of Labor Statistics • S&P Dow Jones Indices • U.S. Census Bureau</p>
        <p style={{ marginTop: '0.4rem', opacity: 0.6 }}>Interactive Vibecession Storyboard • Built with React & Recharts</p>
      </footer>
    </div>
  );
}

// Recharts Custom Tooltip Component
function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="recharts-custom-tooltip">
        <div className="tooltip-date">{label}</div>
        {payload.map((item, idx) => (
          <div key={idx} className="tooltip-row" style={{ color: item.color }}>
            <span>{item.name}:</span>
            <span style={{ fontWeight: 700 }}>
              {item.value !== null && item.value !== undefined ? item.value.toFixed(1) : 'N/A'}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}
