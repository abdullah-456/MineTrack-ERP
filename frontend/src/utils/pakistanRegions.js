// Pakistan provinces/territories and their districts, for the Mine location
// fields (Province → District cascading select). Static reference data — no
// external geography service is integrated in this app.
export const PAKISTAN_REGIONS = {
  'Punjab': [
    'Attock', 'Bahawalnagar', 'Bahawalpur', 'Bhakkar', 'Chakwal', 'Chiniot',
    'Dera Ghazi Khan', 'Faisalabad', 'Gujranwala', 'Gujrat', 'Hafizabad', 'Jhang',
    'Jhelum', 'Kasur', 'Khanewal', 'Khushab', 'Lahore', 'Layyah', 'Lodhran',
    'Mandi Bahauddin', 'Mianwali', 'Multan', 'Muzaffargarh', 'Nankana Sahib',
    'Narowal', 'Okara', 'Pakpattan', 'Rahim Yar Khan', 'Rajanpur', 'Rawalpindi',
    'Sahiwal', 'Sargodha', 'Sheikhupura', 'Sialkot', 'Toba Tek Singh', 'Vehari',
  ],
  'Sindh': [
    'Badin', 'Dadu', 'Ghotki', 'Hyderabad', 'Jacobabad', 'Jamshoro',
    'Kambar Shahdadkot', 'Karachi Central', 'Karachi East', 'Karachi South',
    'Karachi West', 'Kashmore', 'Khairpur', 'Korangi', 'Larkana', 'Malir',
    'Matiari', 'Mirpur Khas', 'Naushahro Feroze', 'Sanghar', 'Shaheed Benazirabad',
    'Shikarpur', 'Sujawal', 'Sukkur', 'Tando Allahyar', 'Tando Muhammad Khan',
    'Tharparkar', 'Thatta', 'Umerkot',
  ],
  'Khyber Pakhtunkhwa': [
    'Abbottabad', 'Bajaur', 'Bannu', 'Battagram', 'Buner', 'Charsadda',
    'Chitral Lower', 'Chitral Upper', 'Dera Ismail Khan', 'Hangu', 'Haripur',
    'Karak', 'Khyber', 'Kohat', 'Kohistan Lower', 'Kohistan Upper', 'Kolai-Palas',
    'Kurram', 'Lakki Marwat', 'Malakand', 'Mansehra', 'Mardan', 'Mohmand',
    'North Waziristan', 'Nowshera', 'Orakzai', 'Peshawar', 'Shangla',
    'South Waziristan', 'Swabi', 'Swat', 'Tank', 'Tor Ghar',
  ],
  'Balochistan': [
    'Awaran', 'Barkhan', 'Chagai', 'Chaman', 'Dera Bugti', 'Duki', 'Gwadar',
    'Harnai', 'Jafarabad', 'Jhal Magsi', 'Kalat', 'Kech', 'Kharan', 'Khuzdar',
    'Kohlu', 'Lasbela', 'Loralai', 'Mastung', 'Musakhel', 'Nasirabad', 'Nushki',
    'Panjgur', 'Pishin', 'Quetta', 'Sherani', 'Sibi', 'Sohbatpur', 'Spin Boldak',
    'Surab', 'Usta Muhammad', 'Washuk', 'Zhob', 'Ziarat',
  ],
  'Islamabad Capital Territory': ['Islamabad'],
  'Azad Jammu & Kashmir': [
    'Bagh', 'Bhimber', 'Hattian Bala', 'Haveli', 'Kotli', 'Mirpur',
    'Muzaffarabad', 'Neelum', 'Poonch (Rawalakot)', 'Sudhanoti',
  ],
  'Gilgit-Baltistan': [
    'Astore', 'Diamer', 'Ghanche', 'Ghizer', 'Gilgit', 'Hunza', 'Kharmang',
    'Nagar', 'Shigar', 'Skardu',
  ],
};

export const PAKISTAN_PROVINCES = Object.keys(PAKISTAN_REGIONS);

export function districtsForProvince(province) {
  return PAKISTAN_REGIONS[province] || [];
}
