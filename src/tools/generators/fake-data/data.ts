/**
 * Pools for the fake data generator.
 *
 * Every value that could be mistaken for a real person is deliberately drawn
 * from a reserved or invented set: e-mail domains are the RFC 2606 `example.*`
 * names, US numbers come from the 555-01xx range television uses, Spanish
 * numbers start with a 000 prefix no operator can hold, and street names are
 * invented rather than copied from a map.
 */

export type Locale = 'en' | 'es';

export interface LocalePool {
  label: string;
  country: string;
  firstNames: string[];
  lastNames: string[];
  /** Built into a full street line together with a number. */
  streetNames: string[];
  streetTypes: string[];
  cities: string[];
  regions: string[];
  companyFirst: string[];
  companySecond: string[];
  companySuffix: string[];
  jobTitles: string[];
}

export const LOCALES: Record<Locale, LocalePool> = {
  en: {
    label: 'English',
    country: 'United States',
    firstNames: [
      'Ada', 'Alex', 'Amara', 'Beatrix', 'Caleb', 'Carmen', 'Cassidy', 'Cyrus', 'Dahlia', 'Desmond',
      'Edith', 'Elliot', 'Esme', 'Felix', 'Freya', 'Gideon', 'Greta', 'Harriet', 'Hugo', 'Imogen',
      'Isaac', 'Jasper', 'Juno', 'Keaton', 'Lena', 'Linus', 'Mabel', 'Marlow', 'Nadia', 'Nolan',
      'Odette', 'Orson', 'Phoebe', 'Quentin', 'Rosalind', 'Rowan', 'Sabine', 'Silas', 'Tabitha', 'Theo',
      'Ursula', 'Vernon', 'Wilhelmina', 'Wren', 'Xavier', 'Yolanda', 'Zachary', 'Zora',
    ],
    lastNames: [
      'Ashby', 'Barlowe', 'Cavendish', 'Doyle', 'Ellery', 'Fairweather', 'Grimsby', 'Halloway',
      'Ingram', 'Jarvis', 'Kingsley', 'Lockwood', 'Mercer', 'Nightingale', 'Osgood', 'Pennington',
      'Quimby', 'Rutherford', 'Sinclair', 'Thackeray', 'Underwood', 'Vance', 'Whitlock', 'Yarrow',
      'Ableton', 'Bramwell', 'Corrigan', 'Danforth', 'Eastwick', 'Fenmore', 'Galloway', 'Hartwell',
    ],
    streetNames: [
      'Bramblewood', 'Cinderhill', 'Duskfield', 'Elmsworth', 'Fernhollow', 'Gladefall', 'Harrowmere',
      'Ivymount', 'Juniper Hollow', 'Kestrel Ridge', 'Larkfield', 'Millbrace', 'Northwick', 'Oakenshaw',
      'Pinewick', 'Quarrymoor', 'Rookery', 'Stonevale', 'Thistledown', 'Umberfield', 'Vellamore',
      'Wrenfield', 'Yarrowgate',
    ],
    streetTypes: ['Street', 'Road', 'Lane', 'Avenue', 'Court', 'Way', 'Terrace', 'Drive'],
    cities: [
      'Ashford', 'Brookfield', 'Cedar Falls', 'Dunmore', 'Eastbrook', 'Fairhaven', 'Granthorpe',
      'Harrowdale', 'Ivybridge', 'Kingsmere', 'Larkspur', 'Millbrook', 'Northgate', 'Oakhurst',
      'Pinecrest', 'Riverton', 'Stonebridge', 'Thornbury', 'Westfield', 'Wyndham',
    ],
    regions: [
      'Arizona', 'California', 'Colorado', 'Delaware', 'Florida', 'Georgia', 'Illinois', 'Indiana',
      'Kansas', 'Maine', 'Maryland', 'Michigan', 'Nevada', 'New Jersey', 'New York', 'Ohio', 'Oregon',
      'Pennsylvania', 'Texas', 'Vermont', 'Virginia', 'Washington', 'Wisconsin',
    ],
    companyFirst: [
      'Northwind', 'Blue Harbor', 'Copperline', 'Drifthouse', 'Everpine', 'Foxglove', 'Granite Row',
      'Halcyon', 'Ironleaf', 'Junebridge', 'Kestrel', 'Lantern', 'Meridian', 'Nightowl', 'Orchard Gate',
      'Paper Lantern', 'Quiet Harbor', 'Redshift', 'Silverbirch', 'Tidewater', 'Umbra', 'Varnish',
    ],
    companySecond: [
      'Logistics', 'Systems', 'Analytics', 'Works', 'Studios', 'Labs', 'Supply', 'Partners', 'Group',
      'Collective', 'Industries', 'Interactive', 'Robotics', 'Provisions', 'Instruments',
    ],
    companySuffix: ['Inc.', 'LLC', 'Ltd.', 'Co.', ''],
    jobTitles: [
      'Accounts Assistant', 'Backend Engineer', 'Brand Strategist', 'Customer Success Lead',
      'Data Analyst', 'Delivery Manager', 'Design Lead', 'Facilities Coordinator', 'Field Technician',
      'Finance Controller', 'Graphic Designer', 'Head of Operations', 'Instructional Designer',
      'Internal Auditor', 'Logistics Planner', 'Marketing Executive', 'Office Manager',
      'Payroll Specialist', 'Product Manager', 'Quality Inspector', 'Recruitment Partner',
      'Research Assistant', 'Sales Representative', 'Site Supervisor', 'Software Engineer',
      'Support Engineer', 'Systems Administrator', 'Technical Writer', 'UX Researcher',
      'Warehouse Coordinator',
    ],
  },
  es: {
    label: 'Español',
    country: 'España',
    firstNames: [
      'Adriana', 'Alejandro', 'Álvaro', 'Ana', 'Andrés', 'Beatriz', 'Bruno', 'Carmen', 'Clara',
      'Daniel', 'Diego', 'Elena', 'Elisa', 'Emilio', 'Fátima', 'Gonzalo', 'Hugo', 'Inés', 'Irene',
      'Iván', 'Javier', 'Julia', 'Leire', 'Lucía', 'Manuel', 'Marta', 'Mateo', 'Miriam', 'Nuria',
      'Óscar', 'Pablo', 'Paula', 'Rocío', 'Rubén', 'Sara', 'Sergio', 'Silvia', 'Teresa', 'Valeria',
      'Vicente', 'Ximena', 'Yolanda',
    ],
    lastNames: [
      'Álvarez', 'Benítez', 'Cabrera', 'Carrasco', 'Castaño', 'Delgado', 'Escudero', 'Fuentes',
      'Gallardo', 'Herrero', 'Ibáñez', 'Jurado', 'Lorenzo', 'Maldonado', 'Nieto', 'Olmedo', 'Pardo',
      'Quintana', 'Rueda', 'Salgado', 'Tejedor', 'Ureña', 'Valverde', 'Zamora', 'Bermejo', 'Cortés',
      'Duarte', 'Esteban', 'Figueroa', 'Guzmán',
    ],
    streetNames: [
      'del Olmo Viejo', 'de las Acacias', 'del Mirador', 'de la Fuente Alta', 'de los Almendros',
      'del Cerro Blanco', 'de la Alameda Nueva', 'del Molino Quieto', 'de la Higuera', 'del Faro Sur',
      'de los Tejados', 'de la Vega Serena', 'del Puente Roto', 'de las Tres Torres', 'del Sauce',
      'de la Luna Baja', 'del Arroyo Claro', 'de los Naranjos',
    ],
    streetTypes: ['Calle', 'Avenida', 'Paseo', 'Plaza', 'Ronda', 'Travesía'],
    cities: [
      'Villanueva del Sur', 'San Cristóbal de Arriba', 'Puerto Alegre', 'Monteclaro', 'Valdeflores',
      'Rivas del Norte', 'Santa Marina', 'Alcorbe', 'Peñalba', 'Torrelinda', 'Fuenteseca',
      'Miralcampo', 'Robledillo', 'Vilarnova', 'Castellar de Abajo',
    ],
    regions: [
      'Andalucía', 'Aragón', 'Asturias', 'Islas Baleares', 'Canarias', 'Cantabria', 'Castilla-La Mancha',
      'Castilla y León', 'Cataluña', 'Extremadura', 'Galicia', 'La Rioja', 'Madrid', 'Murcia', 'Navarra',
      'País Vasco', 'Comunidad Valenciana',
    ],
    companyFirst: [
      'Almenara', 'Bahía Serena', 'Cumbre', 'Delta Verde', 'Encina', 'Faro Norte', 'Granero',
      'Hontanar', 'Isla Clara', 'Jaraiz', 'Lomas', 'Marisma', 'Nogal', 'Olivar', 'Peñarroja',
      'Quintanilla', 'Ribera', 'Senda', 'Tramontana', 'Vega Alta',
    ],
    companySecond: [
      'Soluciones', 'Sistemas', 'Consultores', 'Logística', 'Estudios', 'Tecnologías', 'Servicios',
      'Distribución', 'Innovación', 'Ingeniería', 'Gestión', 'Suministros',
    ],
    companySuffix: ['S.L.', 'S.A.', 'S.L.U.', 'Coop.', ''],
    jobTitles: [
      'Administrativa', 'Analista de datos', 'Arquitecta de software', 'Asesor fiscal',
      'Atención al cliente', 'Coordinador de logística', 'Desarrolladora backend', 'Diseñadora gráfica',
      'Directora de operaciones', 'Encargado de almacén', 'Especialista en nóminas',
      'Gestora de proyectos', 'Ingeniero de sistemas', 'Jefa de ventas', 'Marketing digital',
      'Investigadora UX', 'Recursos humanos', 'Redactora técnica', 'Responsable de calidad',
      'Técnico de soporte', 'Comercial', 'Contable',
    ],
  },
};

export const EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net'];
