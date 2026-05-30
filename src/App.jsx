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

// Reusable Tooltip Component for Technical Terms
function GlossaryTooltip({ term, definition }) {
  return (
    <span className="tooltip-container">
      {term}
      <span className="tooltip-content">{definition}</span>
    </span>
  );
}

const VAR_DEFINITIONS = {
  Unemployment_Rate: "The percentage of the labor force that is jobless. Historically one of the strongest drivers of consumer sentiment.",
  CPI_YoY: "Consumer Price Index Year-over-Year change. Measures the annual rate of inflation.",
  Decayed_CPI_Shock_2020: "A behavioral inflation index where price shock pain decays 50% per year as consumers adapt.",
  Cumulative_CPI_Increase_2020: "Total cumulative consumer price level increase since January 2020.",
  Personal_Savings_Rate: "The percentage of disposable personal income that households save rather than spend.",
  Mortgage_30Y: "Average interest rate on a 30-year fixed rate mortgage in the US.",
  Fed_Funds_Rate: "The Federal Reserve's target interest rate for overnight bank lending.",
  Real_Wage_Index_YoY: "Inflation-adjusted hourly wage growth, showing change in actual purchasing power.",
  Case_Shiller_Index: "The S&P CoreLogic Case-Shiller index measuring U.S. residential home prices.",
  Real_Retail_Sales: "Consumer retail spending adjusted for inflation, showing physical volume of spending.",
  Gas_Prices: "Average regular unleaded gasoline price. Highly visible and psychologically impactful.",
  Policy_Uncertainty: "An index measuring policy uncertainty based on news coverage and tax expirations.",
  Real_Disposable_Income: "Inflation-adjusted after-tax income, showing the actual cash flow families have available.",
  Credit_Card_APR: "Average bank interest rate charged on credit cards. Spiked to record highs above 21.5% in 2024-2026.",
  Auto_Loan_Rate: "Average interest rate on 48-month new car loans. Spiked to over 8.5% in tandem with auto price hikes.",
  Auto_Insurance_CPI: "Consumer Price Index proxy for passenger auto insurance, showing premium inflation of 20%+ per year."
};

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');
  
  // Navigation: Story Chapters
  const [activeChapter, setActiveChapter] = useState('chapter-1');
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [cashFlowSubTab, setCashFlowSubTab] = useState('prices'); // 'prices' | 'capital'
  
  // Chapter 3 Overlays
  const [showWealthEffect, setShowWealthEffect] = useState(false);
  const [showPolicyUncertainty, setShowPolicyUncertainty] = useState(false);
  const [showDisposableIncome, setShowDisposableIncome] = useState(false);
  
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
    Policy_Uncertainty: false,
    Real_Disposable_Income: false,
    Credit_Card_APR: false,
    Auto_Loan_Rate: false,
    Auto_Insurance_CPI: false
  });

  const [visibleStickerLines, setVisibleStickerLines] = useState({
    Wages: true,
    CPI: true,
    Food: true,
    Rent: false,
    Housing: true,
    Insurance: false,
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
    if (data.length === 0) return { coefficients: null, predictedData: [], durbinWatson: null, vifs: {} };
    const trainSet = data.filter(row => {
      const isTrain = row.Date >= trainStart && row.Date <= trainEnd;
      if (!isTrain || row.Consumer_Sentiment === null) return false;
      let hasNull = false;
      Object.keys(regressionVars).forEach(v => {
        if (regressionVars[v] && row[v] === null) hasNull = true;
      });
      return !hasNull;
    });

    if (trainSet.length < 10) return { coefficients: null, error: "Select a wider training range.", predictedData: [], durbinWatson: null, vifs: {} };

    const y = trainSet.map(row => row.Consumer_Sentiment);
    const selectedKeys = Object.keys(regressionVars).filter(k => regressionVars[k]);
    const X = trainSet.map(row => {
      const rowX = [1];
      selectedKeys.forEach(k => rowX.push(row[k]));
      return rowX;
    });

    const beta = solveOLS(y, X);
    if (!beta) return { coefficients: null, error: "Singular matrix. Try modifying inputs.", predictedData: [], durbinWatson: null, vifs: {} };

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
    let residuals = [];
    trainSet.forEach((row, idx) => {
      let pred = beta[0];
      selectedKeys.forEach((k, vIdx) => { pred += beta[vIdx + 1] * row[k]; });
      const resid = y[idx] - pred;
      residuals.push(resid);
      ssRes += Math.pow(resid, 2);
    });

    coefficients['R_Squared'] = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

    // Durbin-Watson statistic
    let numDW = 0;
    let denDW = 0;
    residuals.forEach((resid, idx) => {
      denDW += resid * resid;
      if (idx > 0) {
        const diff = resid - residuals[idx - 1];
        numDW += diff * diff;
      }
    });
    const durbinWatson = denDW > 0 ? numDW / denDW : 0;

    // Variance Inflation Factors (VIFs)
    const vifs = {};
    if (selectedKeys.length <= 1) {
      selectedKeys.forEach(k => { vifs[k] = 1.0; });
    } else {
      selectedKeys.forEach(targetKey => {
        const yAux = trainSet.map(row => row[targetKey]);
        const otherKeys = selectedKeys.filter(k => k !== targetKey);
        const XAux = trainSet.map(row => {
          const rowX = [1];
          otherKeys.forEach(k => rowX.push(row[k]));
          return rowX;
        });
        const betaAux = solveOLS(yAux, XAux);
        if (!betaAux) {
          vifs[targetKey] = 99.9;
        } else {
          const yAuxMean = yAux.reduce((a, b) => a + b, 0) / yAux.length;
          const ssTotAux = yAux.reduce((acc, val) => acc + Math.pow(val - yAuxMean, 2), 0);
          let ssResAux = 0;
          trainSet.forEach((row, idx) => {
            let pred = betaAux[0];
            otherKeys.forEach((k, vIdx) => { pred += betaAux[vIdx + 1] * row[k]; });
            ssResAux += Math.pow(yAux[idx] - pred, 2);
          });
          const r2Aux = ssTotAux > 0 ? 1 - (ssResAux / ssTotAux) : 0;
          const vif = r2Aux >= 1.0 ? 99.9 : 1 / (1 - r2Aux);
          vifs[targetKey] = Math.max(1.0, Math.min(99.9, vif));
        }
      });
    }

    return { coefficients, predictedData, durbinWatson, vifs };
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
    const baseInsurance = baseRow.Auto_Insurance_CPI;

    return data
      .filter(row => row.Date >= baseMonth)
      .map(row => {
        const cpiCumul = ((row.CPI_All_Items / baseCpi) - 1) * 100;
        const foodCumul = ((row.CPI_Food / baseFood) - 1) * 100;
        const rentCumul = ((row.CPI_Rent / baseRent) - 1) * 100;
        const wageCumul = ((row.Average_Hourly_Earnings / baseWages) - 1) * 100;
        const hpiCumul = baseHpi && row.Case_Shiller_Index ? (((row.Case_Shiller_Index / baseHpi) - 1) * 100) : null;
        const insuranceCumul = baseInsurance && row.Auto_Insurance_CPI ? (((row.Auto_Insurance_CPI / baseInsurance) - 1) * 100) : null;
        const lossAversionIdx = 100 + wageCumul - (lossAversionCoef * cpiCumul);

        return {
          Date: row.Date,
          Consumer_Sentiment: row.Consumer_Sentiment,
          Cumulative_CPI: cpiCumul,
          Cumulative_Food: foodCumul,
          Cumulative_Rent: rentCumul,
          Cumulative_Wages: wageCumul,
          Cumulative_Housing: hpiCumul,
          Cumulative_Insurance: insuranceCumul,
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
    const baseHpi = baseRow.Case_Shiller_Index || 215.0;
    const basePolicy = baseRow.Policy_Uncertainty || 120.0;
    const baseIncome = baseRow.Real_Disposable_Income || 17000.0;

    return data
      .filter(row => row.Date >= '2020-01-31')
      .map(row => ({
        Date: row.Date,
        Normalized_Sentiment: row.Consumer_Sentiment ? (row.Consumer_Sentiment / baseSentiment) * 100 : null,
        Normalized_Retail_Sales: row.Real_Retail_Sales ? (row.Real_Retail_Sales / baseSales) * 100 : null,
        Normalized_Housing: row.Case_Shiller_Index ? (row.Case_Shiller_Index / baseHpi) * 100 : null,
        Normalized_Policy_Uncertainty: row.Policy_Uncertainty ? (row.Policy_Uncertainty / basePolicy) * 100 : null,
        Normalized_Income: row.Real_Disposable_Income ? (row.Real_Disposable_Income / baseIncome) * 100 : null
      }));
  }, [data]);

  // Pre-calculated Optimal Model for Chapter 5 / Conclusion View
  const conclusionChartData = useMemo(() => {
    if (data.length === 0) return [];
    return data
      .filter(row => row.Date >= '2020-01-31')
      .map(row => {
        let pred = null;
        if (row.Unemployment_Rate !== null && row.Decayed_CPI_Shock_2020 !== null && row.Personal_Savings_Rate !== null && row.Mortgage_30Y !== null) {
          pred = 102.94 - 4.85 * row.Unemployment_Rate - 2.75 * row.Decayed_CPI_Shock_2020 + 1.42 * row.Personal_Savings_Rate - 1.71 * row.Mortgage_30Y;
        }
        return {
          Date: row.Date,
          'Actual Sentiment': row.Consumer_Sentiment,
          'Optimal Econometric Model': pred !== null ? Math.max(0, Math.min(150, pred)) : null
        };
      });
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
          1. The Paradox
        </button>
        <button 
          className={`tab-btn ${activeChapter === 'chapter-2' ? 'active' : ''}`}
          onClick={() => { setActiveChapter('chapter-2'); setSandboxOpen(false); }}
          style={{ borderRadius: '50px', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
        >
          2. Cash-Flow Squeeze
        </button>
        <button 
          className={`tab-btn ${activeChapter === 'chapter-3' ? 'active' : ''}`}
          onClick={() => { setActiveChapter('chapter-3'); setSandboxOpen(false); }}
          style={{ borderRadius: '50px', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
        >
          3. Do-Say Disconnect
        </button>
        <button 
          className={`tab-btn ${activeChapter === 'chapter-4' ? 'active' : ''}`}
          onClick={() => { setActiveChapter('chapter-4'); setSandboxOpen(false); }}
          style={{ borderRadius: '50px', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
        >
          4. Aligned Histories
        </button>
        <button 
          className={`tab-btn ${activeChapter === 'conclusion' ? 'active' : ''}`}
          onClick={() => { setActiveChapter('conclusion'); setSandboxOpen(false); }}
          style={{ borderRadius: '50px', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
        >
          5. Conclusion
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
                <h3 style={{ fontSize: '1.5rem', color: 'var(--text-bright)' }}>Chapter 1: The Paradox</h3>
                <div className="theory-content" style={{ gap: '1rem', marginTop: '0.5rem' }}>
                  <div style={{ fontStyle: 'italic', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                    <strong>Abstract:</strong> The "Vibecession" (2020–2026) describes the historic disconnect where consumer sentiment plummeted to Great Recession depths despite a 50-year low in unemployment and robust GDP growth. This storyboard presents the <strong>Dual-Core Hypothesis</strong>: that bad vibes are not a psychological delusion, but a rational response to the combination of a cash-flow squeeze (permanent necessity price increases, savings depletion, record credit APRs) and a cognitive perception filter (partisan responding, labor-market security, and high discretionary spending by the wealthy).
                  </div>
                  <p>
                    Historically, U.S. consumer sentiment was highly predictable. A model trained on thirty years of data (**1990-2019**) using just <strong>Unemployment</strong> and <strong>Annual Inflation Rate</strong> explained 60% of the public mood.
                  </p>
                  <p>
                    Post-pandemic, this traditional model broke down entirely. Based on a 3.6% unemployment rate and inflation returning to target, sentiment should have hovered near **90.0**. Instead, it crashed to **50.0** in June 2022, creating a massive "vibe gap."
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
                <h3 style={{ fontSize: '1.5rem', color: 'var(--text-bright)' }}>Chapter 2: The Cash-Flow Squeeze</h3>
                <div className="theory-content" style={{ gap: '0.8rem', marginTop: '0.5rem' }}>
                  <p>
                    The vibecession is anchored in a three-pillar cash-flow squeeze on the bottom 60% of households:
                  </p>
                  <ul style={{ paddingLeft: '1.25rem', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem' }}>
                    <li><strong>Sticker Shock & <GlossaryTooltip term="Loss Aversion" definition="Under Prospect Theory, consumers feel the pain of price increases about twice as intensely as equivalent wage gains." />:</strong> Necessities like food (+33.5%) and rent (+31.8%) outpaced wages, and loss aversion makes price shocks feel twice as painful as equivalent wage gains.</li>
                    <li><strong>Savings Depletion & Debt:</strong> Consumers depleted their <GlossaryTooltip term="savings buffers" definition="Personal Savings Rate collapsed from 15% in 2020 to under 4% by 2023." /> (savings rate fell from 25% to under 4%) and took on high-interest credit card debt.</li>
                    <li><strong>Housing Lockout:</strong> Doubled mortgage payments froze housing inventory and locked out prospective buyers.</li>
                  </ul>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0' }}>
                    <button 
                      onClick={() => setCashFlowSubTab('prices')}
                      style={{ fontSize: '0.75rem', padding: '0.4rem 0.9rem', borderRadius: '50px', background: cashFlowSubTab === 'prices' ? 'var(--primary)' : 'var(--bg-app)', color: 'var(--text-bright)', border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                      Necessity Prices
                    </button>
                    <button 
                      onClick={() => setCashFlowSubTab('capital')}
                      style={{ fontSize: '0.75rem', padding: '0.4rem 0.9rem', borderRadius: '50px', background: cashFlowSubTab === 'capital' ? 'var(--primary)' : 'var(--bg-app)', color: 'var(--text-bright)', border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                      Savings & Borrowing Costs
                    </button>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'flex', gap: '2rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Savings Rate</span>
                      <strong style={{ fontSize: '1.5rem', color: 'var(--danger)' }}>{latestMetrics.Savings_Rate?.toFixed(1)}%</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>30Y Mortgage</span>
                      <strong style={{ fontSize: '1.5rem', color: 'var(--warning)' }}>{latestMetrics.Mortgage_30Y?.toFixed(1)}%</strong>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeChapter === 'chapter-3' && (
              <>
                <h3 style={{ fontSize: '1.5rem', color: 'var(--text-bright)' }}>Chapter 3: The "Do-Say" Disconnect</h3>
                <div className="theory-content" style={{ gap: '1rem', marginTop: '0.5rem' }}>
                  <p>
                    Why did aggregate consumer spending (<GlossaryTooltip term="PCE" definition="Personal Consumption Expenditures: a measure of U.S. consumer spending on goods and services." />) remain robust while sentiment crashed? This is the **Do-Say Disconnect**, driven by two parallel forces:
                  </p>
                  <ul style={{ paddingLeft: '1.25rem', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem' }}>
                    <li><strong><GlossaryTooltip term="Precautionary Savings" definition="Savings held as a buffer against economic risks like job loss. When job security is high, the motive to save collapses." /> Collapse:</strong> In a 50-year low unemployment market (3.6%), consumers felt high job security. This collapsed their precautionary savings motive, prompting them to continue spending despite cost-of-living anxiety.</li>
                    <li><strong>Partisan <GlossaryTooltip term="Expressive Responding" definition="When survey respondents give politically biased answers to support or boo an administration, rather than reporting true personal finances." />:</strong> Sentiment indexes are increasingly contaminated by political polarization. Consumers use surveys to "boo" the sitting administration rather than report actual financial distress.</li>
                  </ul>
                  <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
                    As shown on the chart, aggregate sentiment fell to historical lows while real retail sales expanded by **~15%** since 2020.
                  </p>
                </div>
              </>
            )}

            {activeChapter === 'chapter-4' && (
              <>
                <h3 style={{ fontSize: '1.5rem', color: 'var(--text-bright)' }}>Chapter 4: Aligned Histories & OECD Controls</h3>
                <div className="theory-content" style={{ gap: '1rem', marginTop: '0.5rem' }}>
                  <p>
                    Aligning economic cycles since 1978 reveals that the current cycle is uniquely persistent. In past recessions, prices collapsed, providing cost relief. In the 2020 cycle, prices stabilized at elevated baselines without falling, leaving the squeeze active.
                  </p>
                  <p>
                    <strong>The European Paradox:</strong> European households faced severe energy price shocks and contracting real wages, causing their sentiment and actual spending to collapse in lockstep. The U.S. had robust growth and positive real wages, yet sentiment collapsed to identical depths—highlighting a U.S.-specific psychological and political anomaly.
                  </p>
                  
                  {/* Styled G7/OECD Comparison Table */}
                  <div style={{ marginTop: '0.5rem', overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ padding: '0.5rem', fontWeight: 700, color: 'var(--text-bright)' }}>Region</th>
                          <th style={{ padding: '0.5rem', fontWeight: 700, color: 'var(--text-bright)' }}>Inflation Shock</th>
                          <th style={{ padding: '0.5rem', fontWeight: 700, color: 'var(--text-bright)' }}>Real GDP Growth</th>
                          <th style={{ padding: '0.5rem', fontWeight: 700, color: 'var(--text-bright)' }}>Real Wages</th>
                          <th style={{ padding: '0.5rem', fontWeight: 700, color: 'var(--text-bright)' }}>Sentiment vs Spending</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(99, 102, 241, 0.03)' }}>
                          <td style={{ padding: '0.5rem', fontWeight: 700, color: 'var(--text-bright)' }}>United States</td>
                          <td style={{ padding: '0.5rem' }}>High (Peak 9.1% CPI)</td>
                          <td style={{ padding: '0.5rem', color: 'var(--success)', fontWeight: 600 }}>Robust (+2.5% to +3.0%)</td>
                          <td style={{ padding: '0.5rem', color: 'var(--success)', fontWeight: 600 }}>Positive (+6.5% cumulative)</td>
                          <td style={{ padding: '0.5rem', color: 'var(--danger)', fontWeight: 600 }}>Decoupled (Vibecession)</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '0.5rem', fontWeight: 700, color: 'var(--text-bright)' }}>Eurozone / UK</td>
                          <td style={{ padding: '0.5rem' }}>Severe (Peak 10.6%)</td>
                          <td style={{ padding: '0.5rem', color: 'var(--danger)', fontWeight: 600 }}>Stagnant (Near 0%)</td>
                          <td style={{ padding: '0.5rem', color: 'var(--danger)', fontWeight: 600 }}>Negative (Energy squeeze)</td>
                          <td style={{ padding: '0.5rem', color: 'var(--success)', fontWeight: 600 }}>Coupled (Traditional recession)</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                    For a full econometric and behavioral review, see the critique report: <a href="https://github.com/mike10010100/vibecession/blob/main/vibecession_critique.md" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>vibecession_critique.md</a>.
                  </p>
                </div>
              </>
            )}

            {activeChapter === 'conclusion' && (
              <>
                <h3 style={{ fontSize: '1.5rem', color: 'var(--text-bright)' }}>Chapter 5: Summary Conclusion</h3>
                <div className="theory-content" style={{ gap: '1rem', marginTop: '0.5rem' }}>
                  <p>
                    The "Vibecession" is not a psychological mass delusion or a product of media bias. It is a rational, predictable response to a structural realignment of household financial reality and cognitive perception.
                  </p>
                  <p>
                    When evaluated through the **Dual-Core Hypothesis**, the economic mystery vanishes:
                  </p>
                  <ul style={{ paddingLeft: '1.25rem', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.9rem' }}>
                    <li><strong>The Cash-Flow Core:</strong> Households are squeezed by a permanent 28% necessity price floor, a depleted savings buffer, and record-high borrowing costs (21%+ credit card APRs and doubled mortgage payments).</li>
                    <li><strong>The Cognitive Core:</strong> Job security collapsed the precautionary savings motive, keeping aggregate spending high (the "Do-Say" disconnect), while political polarization and media tone amplified the negative sentiment.</li>
                  </ul>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', color: 'var(--text-muted)' }}>
                    By integrating behavioral decay and borrowing costs into economic models, we restore empirical coherence. The vibes are bad because the structural cash-flow of the average American household is genuinely strained.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* COLLAPSIBLE SANDBOX CONTROLS PANEL */}
          {activeChapter !== 'chapter-3' && activeChapter !== 'chapter-4' && activeChapter !== 'conclusion' && (
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
                              <span>
                                {VAR_DEFINITIONS[k] ? (
                                  <GlossaryTooltip term={k.replace(/_/g, ' ')} definition={VAR_DEFINITIONS[k]} />
                                ) : (
                                  k.replace(/_/g, ' ')
                                )}
                              </span>
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
                          <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-bright)' }}>Model Diagnostics (<GlossaryTooltip term="OLS" definition="Ordinary Least Squares: a method to estimate relationships by minimizing squared differences." />):</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span><GlossaryTooltip term="R-Squared (R²)" definition="Percentage of sentiment variance explained by the model. Higher is better." />:</span>
                              <strong style={{ color: 'var(--text-bright)' }}>{(regressionResults.coefficients.R_Squared * 100).toFixed(1)}%</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span><GlossaryTooltip term="Durbin-Watson (DW)" definition="Tests for residual autocorrelation. 2.0 is ideal; <1.5 indicates positive autocorrelation." />:</span>
                              <strong style={{ color: regressionResults.durbinWatson < 1.0 ? 'var(--danger)' : regressionResults.durbinWatson < 1.5 ? 'var(--warning)' : 'var(--success)' }}>
                                {regressionResults.durbinWatson?.toFixed(3)}
                              </strong>
                            </div>
                          </div>
                          <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-bright)' }}>Coefficients & VIFs:</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', color: 'var(--text-main)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.1rem', marginBottom: '0.1rem', color: 'var(--text-muted)' }}>
                              <span>Variable</span>
                              <span>Coeff (<GlossaryTooltip term="VIF" definition="Variance Inflation Factor: measures multicollinearity. VIF > 10 indicates redundancy." />)</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Intercept</span>
                              <span>{regressionResults.coefficients.Intercept.toFixed(2)}</span>
                            </div>
                            {Object.keys(regressionResults.coefficients).map(k => {
                              if (k === 'Intercept' || k === 'R_Squared') return null;
                              const coeff = regressionResults.coefficients[k];
                              const vif = regressionResults.vifs[k];
                              const isVifHigh = vif > 10;
                              return (
                                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', color: isVifHigh ? 'var(--danger)' : 'inherit' }}>
                                  <span>
                                    {VAR_DEFINITIONS[k] ? (
                                      <GlossaryTooltip term={k.replace(/_/g, ' ')} definition={VAR_DEFINITIONS[k]} />
                                    ) : (
                                      k.replace(/_/g, ' ')
                                    )}
                                  </span>
                                  <span>
                                    {coeff >= 0 ? '+' : ''}{coeff.toFixed(4)} 
                                    <span style={{ color: isVifHigh ? 'var(--danger)' : 'var(--text-muted)', marginLeft: '0.4rem' }}>
                                      ({vif !== undefined ? vif.toFixed(1) : '1.0'})
                                    </span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {Object.values(regressionResults.vifs).some(v => v > 10) && (
                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--danger-glow)', border: '1px solid rgba(244, 63, 94, 0.2)', color: 'var(--danger)', borderRadius: '6px', fontSize: '0.75rem', display: 'flex', gap: '0.4rem' }}>
                              <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '0.05rem' }} />
                              <span><strong>Multicollinearity Alert:</strong> Extreme VIF &gt; 10 detected. The model contains highly correlated predictors (e.g., overlapping interest rates or cumulative price levels). Coefficient signs may flip and are unstable.</span>
                            </div>
                          )}
                          {regressionResults.durbinWatson !== null && regressionResults.durbinWatson < 1.2 && (
                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(244, 63, 94, 0.06)', border: '1px solid rgba(244, 63, 94, 0.15)', color: 'var(--danger)', borderRadius: '6px', fontSize: '0.75rem', display: 'flex', gap: '0.4rem' }}>
                              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '0.05rem' }} />
                              <span><strong>Serial Correlation Warning:</strong> Durbin-Watson &lt; 1.2. Strong autocorrelation in residuals indicates standard errors are severely underestimated, leading to spurious statistical significance.</span>
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
                      {cashFlowSubTab === 'prices' ? (
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
                                  <span>{k === 'LossAversion' ? 'Loss Aversion Index' : k === 'Housing' ? 'Case-Shiller Home Prices' : k === 'Insurance' ? 'Auto Insurance CPI' : k}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--text-muted)' }}>
                          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                          <p>
                            This view plots monthly percentages. Use this data to observe the cash-flow transition from savings depletion to high debt delinquency rates as borrowing costs doubled.
                          </p>
                        </div>
                      )}
                    </>
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

          {/* Chart 2: Cash-Flow Squeeze (Prices & Loss Aversion) */}
          {activeChapter === 'chapter-2' && cashFlowSubTab === 'prices' && (
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
                    {visibleStickerLines.Insurance && <Line name="Auto Insurance CPI (%)" type="monotone" dataKey="Cumulative_Insurance" stroke="#a855f7" strokeWidth={1.5} strokeDasharray="5 2" dot={false} />}
                    {visibleStickerLines.LossAversion && <Line name="Loss Aversion Index" type="monotone" dataKey="Loss_Aversion_Index" stroke="#eab308" strokeWidth={2.5} strokeDasharray="6 3" dot={false} />}
                    <ReferenceLine y={100} stroke="var(--text-muted)" strokeDasharray="3 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* Chart 3: Cash-Flow Squeeze (Savings & Borrowing Costs) */}
          {activeChapter === 'chapter-2' && cashFlowSubTab === 'capital' && (
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
                    <Line yAxisId="percent" name="Credit Card APR (%)" type="monotone" dataKey="Credit_Card_APR" stroke="#fb923c" strokeWidth={2} dot={false} />
                    <Line yAxisId="percent" name="Auto Loan Rate (%)" type="monotone" dataKey="Auto_Loan_Rate" stroke="#60a5fa" strokeWidth={2} dot={false} />
                    <Line yAxisId="distress" name="Card Delinquency (%)" type="monotone" dataKey="Credit_Card_Delinquency_Rate" stroke="var(--danger)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* Chart 4: Do-Say Disconnect */}
          {activeChapter === 'chapter-3' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '1.1rem', color: 'var(--text-bright)' }}>The "Do-Say" Disconnect (Index: Jan 2020 = 100)</h4>
                <span className="chart-subtitle">Sentiment collapsed by half, while inflation-adjusted retail sales expanded by ~15%</span>
              </div>
              
              {/* Interactive Overlays */}
              <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', margin: '0.5rem 0 1rem 0', fontSize: '0.85rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', color: 'var(--text-bright)' }}>
                  <input 
                    type="checkbox" 
                    checked={showWealthEffect}
                    onChange={(e) => setShowWealthEffect(e.target.checked)}
                    style={{ accentColor: 'var(--warning)' }}
                  />
                  <span>Show Home Prices (Wealth Effect)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', color: 'var(--text-bright)' }}>
                  <input 
                    type="checkbox" 
                    checked={showPolicyUncertainty}
                    onChange={(e) => setShowPolicyUncertainty(e.target.checked)}
                    style={{ accentColor: 'var(--secondary)' }}
                  />
                  <span>Show Policy Uncertainty Index</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', color: 'var(--text-bright)' }}>
                  <input 
                    type="checkbox" 
                    checked={showDisposableIncome}
                    onChange={(e) => setShowDisposableIncome(e.target.checked)}
                    style={{ accentColor: '#db2777' }}
                  />
                  <span>Show Real Disposable Income</span>
                </label>
              </div>

              <div className="chart-wrapper" style={{ height: '380px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={disconnectData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#222736' : '#e2e8f0'} />
                    <XAxis dataKey="Date" stroke="var(--text-muted)" fontSize={10} />
                    <YAxis stroke="var(--text-muted)" fontSize={10} domain={[40, 160]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '0.85rem', marginTop: '10px' }} />
                    <Line name="Sentiment Index" type="monotone" dataKey="Normalized_Sentiment" stroke="var(--primary)" strokeWidth={3} dot={false} />
                    <Line name="Real Retail Sales Index" type="monotone" dataKey="Normalized_Retail_Sales" stroke="var(--success)" strokeWidth={3} dot={false} />
                    {showWealthEffect && (
                      <Line name="Home Prices (Wealth Effect)" type="monotone" dataKey="Normalized_Housing" stroke="var(--warning)" strokeWidth={2} dot={false} />
                    )}
                    {showPolicyUncertainty && (
                      <Line name="Policy Uncertainty Index" type="monotone" dataKey="Normalized_Policy_Uncertainty" stroke="var(--secondary)" strokeDasharray="3 3" strokeWidth={1.5} dot={false} />
                    )}
                    {showDisposableIncome && (
                      <Line name="Real Disposable Income" type="monotone" dataKey="Normalized_Income" stroke="#db2777" strokeWidth={2} dot={false} />
                    )}
                    <ReferenceLine y={100} stroke="var(--text-muted)" strokeDasharray="3 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* Chart 5: Aligned Histories */}
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

          {/* Chart 6: Conclusion - Optimal Model Fit */}
          {activeChapter === 'conclusion' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '1.1rem', color: 'var(--text-bright)' }}>Optimal Econometric Model vs. Actual Sentiment</h4>
                <span className="chart-subtitle">Modeling sentiment with Unemployment, Decayed CPI, Savings Rate, and Mortgage Rates (R² ~59.4%)</span>
              </div>
              <div className="chart-wrapper" style={{ height: '380px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={conclusionChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#222736' : '#e2e8f0'} />
                    <XAxis dataKey="Date" stroke="var(--text-muted)" fontSize={10} />
                    <YAxis domain={[40, 110]} stroke="var(--text-muted)" fontSize={10} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '0.85rem', marginTop: '10px' }} />
                    <Line name="Actual Sentiment" type="monotone" dataKey="Actual Sentiment" stroke="var(--primary)" strokeWidth={3} dot={false} />
                    <Line name="Optimal Econometric Model" type="monotone" dataKey="Optimal Econometric Model" stroke="var(--success)" strokeWidth={2.5} strokeDasharray="4 2" dot={false} />
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
