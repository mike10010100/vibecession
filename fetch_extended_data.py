import os
import urllib.request
import pandas as pd
import numpy as np
import json

os.makedirs('data', exist_ok=True)

EXTENDED_SERIES_MAP = {
    'UMCSENT': 'Consumer_Sentiment',
    'CPIAUCSL': 'CPI_All_Items',
    'UNRATE': 'Unemployment_Rate',
    'GDPC1': 'Real_GDP',
    'AHETPI': 'Average_Hourly_Earnings',
    'MORTGAGE30US': 'Mortgage_30Y',
    'FEDFUNDS': 'Fed_Funds_Rate',
    'CPIUFDNS': 'CPI_Food',
    'CPIENGSL': 'CPI_Energy',
    'CUSR0000SEHA': 'CPI_Rent',
    'GASREGCOVW': 'Gas_Prices',
    'REVOLSL': 'Revolving_Consumer_Credit',
    'DRCCLACBS': 'Credit_Card_Delinquency_Rate',
    'PSAVERT': 'Personal_Savings_Rate',
    'TDSP': 'Debt_Service_Ratio',
    'LES1252881600Q': 'Real_Median_Weekly_Earnings',
    'CSUSHPISA': 'Case_Shiller_Index',
    'RRSFS': 'Real_Retail_Sales',
    'USEPUINDXD': 'Policy_Uncertainty'
}

def download_all_data():
    print("Downloading extended data from FRED...")
    for series_id, name in EXTENDED_SERIES_MAP.items():
        url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
        dest_path = f"data/{series_id}.csv"
        try:
            print(f"Fetching {series_id} ({name})...")
            urllib.request.urlretrieve(url, dest_path)
        except Exception as e:
            print(f"Error downloading {series_id}: {e}")
            if os.path.exists(dest_path):
                os.remove(dest_path)

def load_and_preprocess_extended():
    dfs = []
    for series_id, name in EXTENDED_SERIES_MAP.items():
        filepath = f"data/{series_id}.csv"
        if not os.path.exists(filepath):
            print(f"Warning: {filepath} not found. Skipping.")
            continue
        
        try:
            df = pd.read_csv(filepath, parse_dates=['observation_date'], index_col='observation_date')
        except Exception as e:
            print(f"Error parsing {filepath}: {e}. Removing.")
            if os.path.exists(filepath):
                os.remove(filepath)
            continue
            
        df[series_id] = pd.to_numeric(df[series_id].replace('.', np.nan), errors='coerce')
        
        # Resample to monthly (end of month)
        if series_id in ['MORTGAGE30US', 'GASREGCOVW']:
            df_monthly = df.resample('M').mean()
        elif series_id in ['GDPC1', 'LES1252881600Q', 'TDSP']:
            # Quarterly series -> forward fill to monthly
            df_monthly = df.resample('M').ffill()
        else:
            df_monthly = df.resample('M').mean()
            
        df_monthly.columns = [name]
        dfs.append(df_monthly)
        
    merged = dfs[0]
    for df in dfs[1:]:
        merged = merged.join(df, how='outer')
        
    # Forward fill gaps for quarterly data and any daily/weekly residuals
    merged = merged.ffill()
    return merged

def compute_derived(df):
    # Year-over-Year changes
    df['CPI_YoY'] = df['CPI_All_Items'].pct_change(12) * 100
    df['Food_YoY'] = df['CPI_Food'].pct_change(12) * 100
    df['Energy_YoY'] = df['CPI_Energy'].pct_change(12) * 100
    df['Rent_YoY'] = df['CPI_Rent'].pct_change(12) * 100
    df['Wage_YoY'] = df['Average_Hourly_Earnings'].pct_change(12) * 100
    df['Real_Wage_Growth_YoY'] = df['Wage_YoY'] - df['CPI_YoY']
    df['Real_GDP_YoY'] = df['Real_GDP'].pct_change(12) * 100
    df['HPI_YoY'] = df['Case_Shiller_Index'].pct_change(12) * 100
    df['Real_Retail_Sales_YoY'] = df['Real_Retail_Sales'].pct_change(12) * 100
    
    # Real wage index (hourly)
    df['Real_Wage_Index'] = (df['Average_Hourly_Earnings'] / df['CPI_All_Items']) * 100
    df['Real_Wage_Index_YoY'] = df['Real_Wage_Index'].pct_change(12) * 100
    
    # Misery Index
    df['Misery_Index'] = df['Unemployment_Rate'] + df['CPI_YoY']
    
    # Cumulative price increases since Jan 2019 and Jan 2020
    for year in [2019, 2020]:
        cpi_col = f'Cumulative_CPI_Increase_{year}'
        food_col = f'Cumulative_Food_Increase_{year}'
        rent_col = f'Cumulative_Rent_Increase_{year}'
        wage_col = f'Cumulative_Wage_Increase_{year}'
        real_wage_col = f'Cumulative_Real_Wage_{year}'
        hpi_col = f'Cumulative_HPI_Increase_{year}'
        
        jan_cpi = df.loc[f'{year}-01-31', 'CPI_All_Items'] if f'{year}-01-31' in df.index else df.loc[f'{year}-01-25':f'{year}-02-05', 'CPI_All_Items'].mean()
        jan_food = df.loc[f'{year}-01-31', 'CPI_Food'] if f'{year}-01-31' in df.index else df.loc[f'{year}-01-25':f'{year}-02-05', 'CPI_Food'].mean()
        jan_rent = df.loc[f'{year}-01-31', 'CPI_Rent'] if f'{year}-01-31' in df.index else df.loc[f'{year}-01-25':f'{year}-02-05', 'CPI_Rent'].mean()
        jan_wages = df.loc[f'{year}-01-31', 'Average_Hourly_Earnings'] if f'{year}-01-31' in df.index else df.loc[f'{year}-01-25':f'{year}-02-05', 'Average_Hourly_Earnings'].mean()
        jan_hpi = df.loc[f'{year}-01-31', 'Case_Shiller_Index'] if f'{year}-01-31' in df.index else df.loc[f'{year}-01-25':f'{year}-02-05', 'Case_Shiller_Index'].mean()
        
        df[cpi_col] = (df['CPI_All_Items'] / jan_cpi - 1) * 100
        df[food_col] = (df['CPI_Food'] / jan_food - 1) * 100
        df[rent_col] = (df['CPI_Rent'] / jan_rent - 1) * 100
        df[wage_col] = (df['Average_Hourly_Earnings'] / jan_wages - 1) * 100
        df[real_wage_col] = df[wage_col] - df[cpi_col]
        df[hpi_col] = (df['Case_Shiller_Index'] / jan_hpi - 1) * 100

    return df

def save_json_for_dashboard(df):
    df_reset = df.reset_index()
    df_reset['Date'] = df_reset['observation_date'].dt.strftime('%Y-%m-%d')
    df_reset = df_reset.drop(columns=['observation_date'])
    df_reset = df_reset.replace({np.nan: None})
    
    # Save directly to public folder so React can fetch it!
    os.makedirs('public/dataset', exist_ok=True)
    json_path = 'public/dataset/economic_data.json'
    data_list = df_reset.to_dict(orient='records')
    with open(json_path, 'w') as f:
        json.dump(data_list, f, indent=2)
    print(f"JSON data written to {json_path}")

if __name__ == "__main__":
    download_all_data()
    df = load_and_preprocess_extended()
    df = compute_derived(df)
    df.to_csv('data/economic_data_extended.csv')
    save_json_for_dashboard(df)
    print("Extended data pipeline completed successfully!")
